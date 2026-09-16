import type { WASocket } from '@whiskeysockets/baileys';
import { dbPool } from '../config/database';
import { env } from '../config/env';
import { processAIRequest } from '../ai/ollama';
import { buildConversationContext } from './contextBuilder';
import { findOrCreateContact, getContactById } from './contacts';
import { findOrCreateConversation, getConversationById, saveMessageRecord } from './conversations';
import type { IncomingMessagePayload, MessageRecord } from './types';
import { getActiveSocket } from './sender';
import { messageDeduplicator } from './messageDeduplicator';
import { SlidingWindowRateLimiter } from './rateLimiter';
import { LoopGuard } from './loopGuard';
import { sendTyping } from './typing';
import { validateOutgoingReply } from '../safety/outgoingSafety';
import { isApprovedAutoReply } from '../safety/replyPolicy';
import { failClosed } from '../safety/failSafe';
import { logger } from '../utils/logger';
import { auditOrThrow, getAutoReplyControl } from '../safety/autoReplyControl';

export type AutoReplyOutcome =
  | { sent: true; message: MessageRecord }
  | { sent: false; reason: string };

const contactLimiter = new SlidingWindowRateLimiter(env.AUTO_REPLY_PER_CONTACT_PER_MINUTE);
const globalLimiter = new SlidingWindowRateLimiter(env.AUTO_REPLY_GLOBAL_PER_MINUTE);
const loopGuard = new LoopGuard(env.AUTO_REPLY_LOOP_WINDOW_MS);

async function reserveDelivery(messageId: string, conversationId: string): Promise<boolean> {
  const result = await dbPool.query(
    `INSERT INTO auto_reply_deliveries (incoming_message_id, conversation_id, status)
     VALUES ($1, $2, 'SENDING') ON CONFLICT (incoming_message_id) DO NOTHING`,
    [messageId, conversationId],
  );
  return result.rowCount === 1;
}

async function finishDelivery(messageId: string, status: 'SENT' | 'FAILED', outgoingId?: string, failureReason?: string): Promise<void> {
  await dbPool.query(
    `UPDATE auto_reply_deliveries SET status = $2, outgoing_message_id = COALESCE($3, outgoing_message_id),
     failure_reason = COALESCE($4, failure_reason), updated_at = CURRENT_TIMESTAMP
     WHERE incoming_message_id = $1 AND status = 'SENDING'`,
    [messageId, status, outgoingId || null, failureReason || null],
  );
}

export async function processAutoReply(
  payload: IncomingMessagePayload,
  socket: WASocket | null = getActiveSocket(),
): Promise<AutoReplyOutcome> {
  if (!env.WHATSAPP_AUTO_REPLY_ENABLED || env.WHATSAPP_AUTO_REPLY_KILL_SWITCH) {
    return failClosed('auto_reply_disabled');
  }
  if (payload.isFromMe || !payload.senderJid.endsWith('@s.whatsapp.net')) return failClosed('incoming_validation_failed');
  if (!messageDeduplicator.claim(payload.messageId)) return failClosed('duplicate_incoming_message');
  if (loopGuard.shouldBlock(payload.senderPhone)) {
    try {
      await auditOrThrow({ eventType: 'LOOP_BLOCKED', reason: 'loop_guard', incomingMessageId: payload.messageId });
    } catch (auditError) {
      logger.error({ err: auditError, incomingMessageId: payload.messageId }, '[AUTO-REPLY] Loop audit failed');
    }
    return failClosed('loop_guard');
  }
  if (!socket) return failClosed('whatsapp_socket_unavailable');

  try {
    const control = await getAutoReplyControl();
    if (!control.enabled || control.emergency_shutdown) return failClosed('global_auto_reply_disabled');
    if (!contactLimiter.allow(payload.senderPhone) || !globalLimiter.allow('global')) return failClosed('rate_limited');

    const contact = await findOrCreateContact(payload.senderPhone, payload.senderJid, payload.senderName);
    if (!contact.ai_enabled || contact.ai_mode === 'OFF') return failClosed('contact_auto_reply_disabled');
    const conversation = await findOrCreateConversation(contact.id);
    if (!(await reserveDelivery(payload.messageId, conversation.id))) return failClosed('delivery_already_reserved');

    const context = await buildConversationContext(conversation.id);
    const result = await processAIRequest(conversation.id, payload.text);
    if (!result.success || !result.allowed || !isApprovedAutoReply(result.responseAction || 'WAIT', {
      conversationId: conversation.id,
      userMessage: payload.text,
      rawContext: context,
      decision: result.decision,
      contactName: context.contact.displayName,
      summary: context.summary || null,
      memories: context.memories,
      recentMessages: context.recentMessages,
      routing: result.routing,
    })) {
      await finishDelivery(payload.messageId, 'FAILED', undefined, `response_not_approved:${result.responseAction || 'UNKNOWN'}`);
      return failClosed(`response_not_approved:${result.responseAction || 'UNKNOWN'}`);
    }
    const safe = validateOutgoingReply(payload.senderJid, result.answer);
    if (!safe.allowed || !safe.text) {
      await finishDelivery(payload.messageId, 'FAILED', undefined, `outgoing_safety:${safe.reason}`);
      return failClosed(`outgoing_safety:${safe.reason}`);
    }

    const finalControl = await getAutoReplyControl();
    const finalConversation = await getConversationById(conversation.id);
    const finalContact = await getContactById(contact.id);
    if (
      !finalControl.enabled ||
      finalControl.emergency_shutdown ||
      !finalContact ||
      !finalContact.ai_enabled ||
      finalContact.ai_mode === 'OFF' ||
      !finalConversation ||
      finalConversation.status !== 'ACTIVE' ||
      finalConversation.last_speaker === 'ADMIN' ||
      !getActiveSocket() ||
      getActiveSocket() !== socket
    ) {
      await finishDelivery(payload.messageId, 'FAILED', undefined, 'final_state_check_failed');
      await auditOrThrow({ eventType: 'FINAL_STATE_BLOCKED', reason: 'final_state_check_failed', incomingMessageId: payload.messageId, conversationId: conversation.id, contactId: contact.id });
      return failClosed('final_state_check_failed');
    }
    await auditOrThrow({ eventType: 'SEND_RESERVED', incomingMessageId: payload.messageId, conversationId: conversation.id, contactId: contact.id });

    await sendTyping(socket, payload.senderJid, env.AUTO_REPLY_TYPING_ENABLED);
    let sent;
    try {
      sent = await socket.sendMessage(payload.senderJid, { text: safe.text });
    } catch (error) {
      await finishDelivery(payload.messageId, 'FAILED', undefined, 'baileys_send_failed');
      return failClosed('baileys_send_failed', error);
    } finally {
      try { await socket.sendPresenceUpdate('paused', payload.senderJid); } catch { /* presence is best effort */ }
    }

    const outgoingId = sent?.key?.id || `auto_${Date.now()}`;
    const saved = await saveMessageRecord({
      conversationId: conversation.id,
      messageId: outgoingId,
      direction: 'OUTGOING',
      senderType: 'AI',
      senderPhone: 'ME',
      receiverPhone: payload.senderPhone,
      messageType: 'TEXT',
      messageText: safe.text,
      timestamp: new Date(),
      isFromMe: true,
    });
    await finishDelivery(payload.messageId, 'SENT', outgoingId);
    try {
      await auditOrThrow({ eventType: 'SENT', incomingMessageId: payload.messageId, conversationId: conversation.id, contactId: contact.id, metadata: { outgoingMessageId: outgoingId } });
    } catch (auditError) {
      logger.error({ err: auditError, incomingMessageId: payload.messageId }, '[AUTO-REPLY] Sent message audit failed');
    }
    logger.info({ conversationId: conversation.id, incomingMessageId: payload.messageId }, '[AUTO-REPLY] Reply sent');
    return { sent: true, message: saved };
  } catch (error) {
    return failClosed('auto_reply_processing_failed', error);
  }
}

export function resetAutoReplyGuards(): void {
  contactLimiter.reset();
  globalLimiter.reset();
}
