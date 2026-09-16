import type { WAMessage } from '@whiskeysockets/baileys';
import { extractTextFromWAMessage } from './receiver';
import { extractPhoneFromJid } from './contacts';
import type { IncomingMessagePayload } from './types';

export type ParsedIncomingMessage =
  | { accepted: true; payload: IncomingMessagePayload }
  | { accepted: false; reason: string };

export function parseIncomingMessage(msg: WAMessage, myPhone = 'ME'): ParsedIncomingMessage {
  const key = msg.key;
  const jid = key?.remoteJid;
  if (!key || !jid) return { accepted: false, reason: 'missing_message_key' };
  if (key.fromMe) return { accepted: false, reason: 'outgoing_message' };
  if (jid === 'status@broadcast') return { accepted: false, reason: 'status_message' };
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return { accepted: false, reason: 'group_or_broadcast' };
  if (!jid.endsWith('@s.whatsapp.net')) return { accepted: false, reason: 'non_individual_jid' };
  const text = extractTextFromWAMessage(msg)?.trim();
  if (!text || text.length > 4000) return { accepted: false, reason: text ? 'message_too_long' : 'empty_message' };
  const messageId = key.id?.trim();
  if (!messageId) return { accepted: false, reason: 'missing_message_id' };
  return {
    accepted: true,
    payload: {
      messageId,
      senderJid: jid,
      senderPhone: extractPhoneFromJid(jid),
      senderName: msg.pushName || null,
      text,
      timestamp: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
      isFromMe: false,
    },
  };
}
