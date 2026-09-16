import { PoolClient } from 'pg';
import { dbPool } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getContactById, getContactDisplayName } from './contacts';
import { getConversationById, getConversationHistory, getConversationSummary, ConversationHistoryFilters } from './conversations';
import { getRelevantMemories } from './memory';
import {
  ConversationRecord,
  ConversationContextPayload,
  FormattedContextMessage,
  LastSpeaker,
  MessageRecord,
} from './types';

/**
 * Format message record menjadi format role-content yang terstruktur
 * - USER -> user
 * - ADMIN -> admin
 * - AI -> assistant
 * - SYSTEM -> system
 */
export function formatMessageForContext(msg: MessageRecord): FormattedContextMessage {
  let role: 'user' | 'assistant' | 'admin' | 'system' = 'user';
  switch (msg.sender_type) {
    case 'USER':
      role = 'user';
      break;
    case 'ADMIN':
      role = 'admin';
      break;
    case 'AI':
      role = 'assistant';
      break;
    case 'SYSTEM':
      role = 'system';
      break;
    default:
      role = msg.is_from_me ? 'admin' : 'user';
  }

  return {
    role,
    content: msg.message_text,
    senderType: msg.sender_type,
    timestamp: msg.timestamp,
  };
}

/**
 * Mengambil pesan terbaru berdasarkan role tertentu
 */
export async function getLastUserMessage(conversationId: string): Promise<MessageRecord | null> {
  const client = await dbPool.connect();
  try {
    const res = await client.query<MessageRecord>(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND sender_type = 'USER'
       ORDER BY timestamp DESC LIMIT 1;`,
      [conversationId]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  } finally {
    client.release();
  }
}

export async function getLastAdminMessage(conversationId: string): Promise<MessageRecord | null> {
  const client = await dbPool.connect();
  try {
    const res = await client.query<MessageRecord>(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND sender_type = 'ADMIN'
       ORDER BY timestamp DESC LIMIT 1;`,
      [conversationId]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  } finally {
    client.release();
  }
}

export async function getLastAIMessage(conversationId: string): Promise<MessageRecord | null> {
  const client = await dbPool.connect();
  try {
    const res = await client.query<MessageRecord>(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND sender_type = 'AI'
       ORDER BY timestamp DESC LIMIT 1;`,
      [conversationId]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  } finally {
    client.release();
  }
}

export async function getLastSpeaker(conversationId: string): Promise<LastSpeaker> {
  const conv = await getConversationById(conversationId);
  return conv ? conv.last_speaker : 'USER';
}

export interface BuildConversationContextOptions {
  messageLimit?: number;
  memoryLimit?: number;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  senderTypes?: Array<MessageRecord['sender_type']>;
}

/**
 * Membangun Konteks Percakapan Lengkap (Conversation Context)
 * Menggabungkan:
 * 1. Contact Context (displayName, category, aiMode, notes)
 * 2. State Percakapan (status, lastSpeaker, ai_paused_until)
 * 3. Memori aktif yang relevan (hingga MEMORY_LIMIT)
 * 4. Ringkasan percakapan sebelumnya (jika ada)
 * 5. Riwayat pesan berurutan oldest -> newest (hingga CONTEXT_MESSAGE_LIMIT)
 */
export async function buildConversationContext(
  conversationId: string,
  messageLimitOrOptions: number | BuildConversationContextOptions = env.CONTEXT_MESSAGE_LIMIT || 20,
  memoryLimit: number | PoolClient = env.MEMORY_LIMIT || 10,
  maybeExternalClient?: PoolClient
): Promise<ConversationContextPayload> {
  const client = typeof memoryLimit === 'object' ? memoryLimit : (maybeExternalClient || (await dbPool.connect()));
  const shouldRelease = typeof memoryLimit !== 'object' && !maybeExternalClient;

  try {
    const options: BuildConversationContextOptions = typeof messageLimitOrOptions === 'number'
      ? { messageLimit: messageLimitOrOptions, memoryLimit: typeof memoryLimit === 'number' ? memoryLimit : env.MEMORY_LIMIT || 10 }
      : messageLimitOrOptions;

    const messageLimit = options.messageLimit ?? env.CONTEXT_MESSAGE_LIMIT ?? 20;
    const resolvedMemoryLimit = options.memoryLimit ?? (typeof memoryLimit === 'number' ? memoryLimit : env.MEMORY_LIMIT ?? 10);

    const conv = await getConversationById(conversationId, client);
    if (!conv) {
      throw new Error(`Conversation ${conversationId} tidak ditemukan`);
    }

    const contact = await getContactById(conv.contact_id);
    if (!contact) {
      throw new Error(`Kontak untuk conversation ${conversationId} tidak ditemukan`);
    }

    const historyFilters: ConversationHistoryFilters = {
      limit: messageLimit,
      senderTypes: options.senderTypes,
      startAt: options.startAt ?? undefined,
      endAt: options.endAt ?? undefined,
    };
    const rawMessages = await getConversationHistory(conversationId, historyFilters);
    const formattedMessages = rawMessages.map(formatMessageForContext);

    const memories = await getRelevantMemories(contact.id, resolvedMemoryLimit, client);
    const summary = await getConversationSummary(conversationId, client);

    const isPaused = conv.status === 'AI_PAUSED' && (!conv.ai_paused_until || new Date(conv.ai_paused_until) > new Date());
    const aiAllowed = contact.ai_mode !== 'OFF' && !isPaused;

    return {
      conversationId,
      contact: {
        displayName: getContactDisplayName(contact),
        category: contact.category,
        aiMode: contact.ai_mode,
        notes: contact.notes,
        firstMessageAt: contact.first_message_at,
        lastMessageAt: contact.last_message_at,
      },
      state: {
        status: conv.status,
        aiMode: contact.ai_mode,
        lastSpeaker: conv.last_speaker,
        aiPausedUntil: conv.ai_paused_until,
        isAIPaused: isPaused,
        aiAllowed,
      },
      memories,
      summary,
      recentMessages: formattedMessages,
    };
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}
