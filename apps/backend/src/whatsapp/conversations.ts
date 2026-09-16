import { PoolClient } from 'pg';
import { dbPool } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  ConversationRecord,
  MessageRecord,
  MessageDirection,
  MessageType,
  SenderType,
  ConversationStatus,
  LastSpeaker,
} from './types';

export interface ConversationHistoryFilters {
  limit?: number;
  senderTypes?: SenderType[];
  directions?: MessageDirection[];
  startAt?: Date | string | null;
  endAt?: Date | string | null;
}

export interface ConversationSummaryRecordInput {
  conversationId: string;
  summary: string;
  messageStartId?: string | null;
  messageEndId?: string | null;
}

export function isAIAllowedForConversation(
  aiMode: string | null | undefined,
  status?: ConversationStatus,
  aiPausedUntil?: Date | string | null
): boolean {
  if (aiMode === 'OFF') {
    return false;
  }

  if (status === 'AI_PAUSED' && (!aiPausedUntil || new Date(aiPausedUntil) > new Date())) {
    return false;
  }

  return true;
}

function normalizeHistoryLimit(limit: number | undefined, fallback = env.CONTEXT_MESSAGE_LIMIT || 20): number {
  const safeLimit = Number.isFinite(limit) ? Number(limit) : fallback;
  if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(safeLimit), 500);
}

/**
 * Mencari atau membuat sesi percakapan (conversation) untuk sebuah kontak
 */
export async function findOrCreateConversation(
  contactId: string,
  externalClient?: PoolClient
): Promise<ConversationRecord> {
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    const existing = await client.query<ConversationRecord>(
      'SELECT * FROM conversations WHERE contact_id = $1 ORDER BY updated_at DESC LIMIT 1;',
      [contactId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const inserted = await client.query<ConversationRecord>(
      `INSERT INTO conversations (
        contact_id, status, last_speaker, last_message_at
      ) VALUES ($1, 'ACTIVE', 'USER', CURRENT_TIMESTAMP)
      RETURNING *;`,
      [contactId]
    );

    logger.info(`[DB] Conversation created for contact ID: ${contactId}`);
    return inserted.rows[0];
  } catch (error: any) {
    logger.error({ err: error.message, contactId }, '[DB] Gagal mencari atau membuat conversation');
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Mengambil detail percakapan berdasarkan ID dan mengevaluasi status expired AI_PAUSED
 */
export async function getConversationById(
  conversationId: string,
  externalClient?: PoolClient
): Promise<ConversationRecord | null> {
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    const result = await client.query<ConversationRecord>(
      'SELECT * FROM conversations WHERE id = $1 LIMIT 1;',
      [conversationId]
    );

    if (result.rows.length === 0) return null;

    let conv = result.rows[0];
    // Evaluasi AI_PAUSED jika waktu pause sudah lewat
    if (conv.status === 'AI_PAUSED' && conv.ai_paused_until) {
      const now = new Date();
      if (new Date(conv.ai_paused_until) <= now) {
        // Otomatis kembalikan status ke ACTIVE
        const updateRes = await client.query<ConversationRecord>(
          `UPDATE conversations
           SET status = 'ACTIVE', ai_paused_until = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *;`,
          [conversationId]
        );
        conv = updateRes.rows[0];
        logger.info(`[CONVERSATION] Masa AI_PAUSED selesai untuk conv ID: ${conversationId}, status kembali ke ACTIVE.`);
      }
    }

    return conv;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Menyimpan pesan ke database PostgreSQL dan memperbarui state conversation secara transaksional
 */
export async function saveMessageRecord(
  params: {
    conversationId: string;
    messageId: string;
    direction: MessageDirection;
    senderType?: SenderType;
    senderPhone: string;
    receiverPhone: string;
    messageType?: MessageType;
    messageText: string;
    timestamp: Date;
    isFromMe: boolean;
  },
  externalClient?: PoolClient
): Promise<MessageRecord> {
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    // 1. Tentukan sender_type secara konsisten jika belum disediakan
    let finalSenderType: SenderType = params.senderType || 'USER';
    if (!params.senderType) {
      if (!params.isFromMe) {
        finalSenderType = 'USER';
      } else {
        finalSenderType = 'ADMIN'; // Default jika dikirim manual oleh pemilik nomor
      }
    }

    const inserted = await client.query<MessageRecord>(
      `INSERT INTO messages (
        conversation_id, message_id, direction, sender_type, sender_phone, receiver_phone,
        message_type, message_text, timestamp, is_from_me
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (message_id) DO NOTHING
      RETURNING *;`,
      [
        params.conversationId,
        params.messageId,
        params.direction,
        finalSenderType,
        params.senderPhone,
        params.receiverPhone,
        params.messageType || 'TEXT',
        params.messageText,
        params.timestamp,
        params.isFromMe,
      ]
    );

    // 2. Tentukan state conversation & last speaker
    const lastSpeaker: LastSpeaker = finalSenderType;
    let statusUpdateQuery = '';
    const queryParams: any[] = [params.timestamp, lastSpeaker, params.conversationId];

    if (finalSenderType === 'ADMIN') {
      // Admin Takeover: set status AI_PAUSED dan hitung ai_paused_until
      const timeoutMinutes = env.ADMIN_TAKEOVER_TIMEOUT_MINUTES || 30;
      const pausedUntil = new Date(params.timestamp.getTime() + timeoutMinutes * 60 * 1000);
      queryParams.splice(2, 0, pausedUntil); // insert pausedUntil parameter
      // parameters: $1: timestamp, $2: lastSpeaker, $3: pausedUntil, $4: conversationId
      statusUpdateQuery = `
        UPDATE conversations
        SET last_message_at = $1,
            last_admin_message_at = $1,
            last_speaker = $2,
            status = 'AI_PAUSED',
            ai_paused_until = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4;
      `;
      logger.info(
        `[ADMIN TAKEOVER] Admin membalas di conversation ${params.conversationId}. AI_PAUSED selama ${timeoutMinutes} menit (hingga ${pausedUntil.toISOString()}).`
      );
    } else if (finalSenderType === 'USER') {
      statusUpdateQuery = `
        UPDATE conversations
        SET last_message_at = $1,
            last_user_message_at = $1,
            last_speaker = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3;
      `;
    } else if (finalSenderType === 'AI') {
      statusUpdateQuery = `
        UPDATE conversations
        SET last_message_at = $1,
            last_ai_message_at = $1,
            last_speaker = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3;
      `;
    } else {
      statusUpdateQuery = `
        UPDATE conversations
        SET last_message_at = $1,
            last_speaker = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3;
      `;
    }

    await client.query(statusUpdateQuery, queryParams);

    const savedRecord = inserted.rows[0];
    logger.info(
      `[DB] Message saved: ${params.messageId} (${params.direction} - ${finalSenderType} - ${params.senderPhone})`
    );
    return savedRecord;
  } catch (error: any) {
    logger.error({ err: error.message, messageId: params.messageId }, '[DB] Gagal menyimpan pesan ke database');
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Update AI pause status secara manual via API
 */
export async function pauseConversationAI(
  conversationId: string,
  durationMinutes = 30
): Promise<ConversationRecord> {
  const client = await dbPool.connect();
  try {
    const pausedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    const result = await client.query<ConversationRecord>(
      `UPDATE conversations
       SET status = 'AI_PAUSED',
           ai_paused_until = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *;`,
      [pausedUntil, conversationId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Conversation ${conversationId} tidak ditemukan`);
    }

    logger.info(`[CONVERSATION] AI di-pause manual untuk conv ${conversationId} hingga ${pausedUntil.toISOString()}`);
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Resume AI status secara manual via API
 */
export async function resumeConversationAI(conversationId: string): Promise<ConversationRecord> {
  const client = await dbPool.connect();
  try {
    const result = await client.query<ConversationRecord>(
      `UPDATE conversations
       SET status = 'ACTIVE',
           ai_paused_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *;`,
      [conversationId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Conversation ${conversationId} tidak ditemukan`);
    }

    logger.info(`[CONVERSATION] AI di-resume kembali ke ACTIVE untuk conv ${conversationId}`);
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Mengambil riwayat pesan berurutan: oldest -> newest
 */
export async function getConversationHistory(
  conversationId: string,
  limitOrFilters: number | ConversationHistoryFilters = env.CONTEXT_MESSAGE_LIMIT || 20
): Promise<MessageRecord[]> {
  const client = await dbPool.connect();
  try {
    const filters: ConversationHistoryFilters = typeof limitOrFilters === 'number'
      ? { limit: limitOrFilters }
      : limitOrFilters;

    const limit = normalizeHistoryLimit(filters.limit, env.CONTEXT_MESSAGE_LIMIT || 20);
    const senderTypes = filters.senderTypes && filters.senderTypes.length > 0 ? filters.senderTypes : null;
    const directions = filters.directions && filters.directions.length > 0 ? filters.directions : null;

    const clauses: string[] = ['conversation_id = $1'];
    const params: any[] = [conversationId];
    let nextIndex = 2;

    if (filters.startAt) {
      clauses.push(`timestamp >= $${nextIndex}`);
      params.push(new Date(filters.startAt));
      nextIndex += 1;
    }

    if (filters.endAt) {
      clauses.push(`timestamp <= $${nextIndex}`);
      params.push(new Date(filters.endAt));
      nextIndex += 1;
    }

    if (senderTypes && senderTypes.length > 0) {
      clauses.push(`sender_type = ANY($${nextIndex})`);
      params.push(senderTypes);
      nextIndex += 1;
    }

    if (directions && directions.length > 0) {
      clauses.push(`direction = ANY($${nextIndex})`);
      params.push(directions);
      nextIndex += 1;
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const result = await client.query<MessageRecord>(
      `SELECT * FROM (
         SELECT * FROM messages
         ${whereClause}
         ORDER BY timestamp DESC
         LIMIT $${nextIndex}
       ) sub
       ORDER BY timestamp ASC;`,
      [...params, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function upsertConversationSummary(
  params: ConversationSummaryRecordInput,
  externalClient?: PoolClient
): Promise<{ id: string; conversation_id: string; summary: string; message_start_id: string | null; message_end_id: string | null; created_at: Date; updated_at: Date } | null> {
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    const result = await client.query<{ id: string; conversation_id: string; summary: string; message_start_id: string | null; message_end_id: string | null; created_at: Date; updated_at: Date }>(
      `INSERT INTO conversation_summaries (
         conversation_id, summary, message_start_id, message_end_id
       ) VALUES ($1, $2, $3, $4)
       RETURNING *;`,
      [params.conversationId, params.summary.trim(), params.messageStartId || null, params.messageEndId || null]
    );

    return result.rows[0] || null;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

export async function getConversationSummary(
  conversationId: string,
  externalClient?: PoolClient
): Promise<string | null> {
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    const result = await client.query<{ summary: string }>(
      'SELECT summary FROM conversation_summaries WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1;',
      [conversationId]
    );

    return result.rows.length > 0 ? result.rows[0].summary : null;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Mengambil daftar percakapan milik sebuah kontak
 */
export async function getConversationsByContactId(contactId: string): Promise<ConversationRecord[]> {
  const client = await dbPool.connect();
  try {
    const result = await client.query<ConversationRecord>(
      'SELECT * FROM conversations WHERE contact_id = $1 ORDER BY last_message_at DESC;',
      [contactId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Mengambil daftar pesan dalam sebuah percakapan
 */
export async function getMessagesByConversationId(
  conversationId: string,
  limit = 50
): Promise<MessageRecord[]> {
  return getConversationHistory(conversationId, limit);
}
