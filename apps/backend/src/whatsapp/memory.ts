import { PoolClient } from 'pg';
import { dbPool } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  MemoryItemRecord,
  MemoryType,
  MemoryImportance,
  MemorySource,
} from './types';

// Regex sederhana untuk deteksi data sensitif agar tidak masuk ke memory.
// Fokus pada data yang benar-benar berisiko: OTP, password, PIN, token, kartu kredit,
// tanpa terlalu agresif memblokir nama usaha atau teks normal.
const SENSITIVE_PATTERNS = [
  /\b(?:otp|one[- ]time\s*password|password|passcode|pin|cvv|token|secret|kunci)\b(?:\s+(?:adalah|ialah|itu|anda|kamu|saya|:|=))?\s*[:=]?\s*[A-Za-z0-9!@#$%^&*()_+\-={}\[\]:;"'<>?,./\\~`]{3,}/i,
  /\b\d{6}\b/, // Kemungkinan kode OTP 6-digit
  /(?:\d[ -]?){13,19}/, // Nomor kartu kredit / debit, 13-19 digit dengan spasi atau tanda hubung
  /\b(?:\d{4}[\s-]){3}\d{4}\b/, // Format kartu kredit yang umum: 1234 5678 9012 3456
  /\b(?:password|pin|cvv|token)\s*[:=]\s*\S+/i, // Kredensial eksplisit
];

/**
 * Validasi keamanan data sebelum disimpan ke memory_items
 */
export function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface CreateMemoryPayload {
  contactId: string;
  conversationId?: string | null;
  type?: MemoryType;
  key: string;
  value: string;
  importance?: MemoryImportance;
  source?: MemorySource;
}

export interface UpdateMemoryPayload {
  type?: MemoryType;
  key?: string;
  value?: string;
  importance?: MemoryImportance;
  isActive?: boolean;
}

/**
 * Membuat item memori baru (prioritas input manual/admin pada Tahap 4)
 */
export async function createMemoryItem(
  payload: CreateMemoryPayload,
  externalClient?: PoolClient
): Promise<MemoryItemRecord> {
  if (containsSensitiveData(payload.value) || containsSensitiveData(payload.key)) {
    throw new Error('Nilai atau key memori terdeteksi mengandung data sensitif/kredensial dan ditolak demi privasi.');
  }

  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    const type: MemoryType = payload.type || 'OTHER';
    const importance: MemoryImportance = payload.importance || 'MEDIUM';
    const source: MemorySource = payload.source || 'ADMIN';

    const result = await client.query<MemoryItemRecord>(
      `INSERT INTO memory_items (
        contact_id, conversation_id, type, key, value, importance, source, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *;`,
      [
        payload.contactId,
        payload.conversationId || null,
        type,
        payload.key.trim(),
        payload.value.trim(),
        importance,
        source,
      ]
    );

    logger.info(`[MEMORY] Memori dibuat untuk kontak ${payload.contactId}: [${type}] ${payload.key}`);
    return result.rows[0];
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Memperbarui item memori
 */
export async function updateMemoryItem(
  memoryId: string,
  payload: UpdateMemoryPayload,
  externalClient?: PoolClient
): Promise<MemoryItemRecord> {
  if (payload.value && containsSensitiveData(payload.value)) {
    throw new Error('Nilai memori terdeteksi mengandung data sensitif/kredensial.');
  }

  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    const existing = await client.query<MemoryItemRecord>(
      'SELECT * FROM memory_items WHERE id = $1 LIMIT 1;',
      [memoryId]
    );

    if (existing.rows.length === 0) {
      throw new Error(`Memory item ${memoryId} tidak ditemukan`);
    }

    const current = existing.rows[0];
    const newType = payload.type ?? current.type;
    const newKey = payload.key ?? current.key;
    const newValue = payload.value ?? current.value;
    const newImportance = payload.importance ?? current.importance;
    const newIsActive = payload.isActive ?? current.is_active;

    const result = await client.query<MemoryItemRecord>(
      `UPDATE memory_items
       SET type = $1, key = $2, value = $3, importance = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *;`,
      [newType, newKey, newValue, newImportance, newIsActive, memoryId]
    );

    logger.info(`[MEMORY] Memori ${memoryId} berhasil diperbarui.`);
    return result.rows[0];
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Menghapus item memori (soft delete dengan is_active = false atau hard delete)
 */
export async function deleteMemoryItem(
  memoryId: string,
  hardDelete = false,
  externalClient?: PoolClient
): Promise<{ success: boolean }> {
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    if (hardDelete) {
      await client.query('DELETE FROM memory_items WHERE id = $1;', [memoryId]);
    } else {
      await client.query(
        'UPDATE memory_items SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1;',
        [memoryId]
      );
    }

    logger.info(`[MEMORY] Memori ${memoryId} dihapus (hardDelete: ${hardDelete}).`);
    return { success: true };
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Mengambil memori aktif yang relevan untuk suatu kontak dengan batas MEMORY_LIMIT
 * Diurutkan berdasarkan:
 * 1. Importance (HIGH -> MEDIUM -> LOW)
 * 2. Updated terbaru (DESC)
 */
export async function getRelevantMemories(
  contactId: string,
  limit: number = env.MEMORY_LIMIT || 10,
  externalClient?: PoolClient
): Promise<MemoryItemRecord[]> {
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    const result = await client.query<MemoryItemRecord>(
      `SELECT * FROM memory_items
       WHERE contact_id = $1 AND is_active = TRUE
       ORDER BY 
         CASE importance
           WHEN 'HIGH' THEN 1
           WHEN 'MEDIUM' THEN 2
           WHEN 'LOW' THEN 3
           ELSE 4
         END ASC,
         updated_at DESC
       LIMIT $2;`,
      [contactId, limit]
    );

    return result.rows;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}
