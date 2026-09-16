import { PoolClient } from 'pg';
import { dbPool } from '../config/database';
import { logger } from '../utils/logger';
import { classifyContactName } from './contactClassifier';
import {
  ContactRecord,
  ContactCategory,
  CategorySource,
  UpdateContactPayload,
} from './types';

/**
 * Normalisasi format nomor telepon tanpa merusak nomor internasional
 * - Jika diawali "+" -> buang tanda plus
 * - Jika diawali "0" (nomor lokal Indonesia) -> ubah 08xxx menjadi 628xxx
 * - Jika nomor internasional lain (contoh: "14155552671", "44712345678") -> pertahankan digit aslinya
 */
export function normalizePhone(raw: string): string {
  let cleaned = raw.trim().replace(/[^\d+]/g, ''); // pertahankan digit & plus awal jika ada
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Jika format lokal Indonesia (dimulai dengan 08)
  if (cleaned.startsWith('0') && cleaned.length >= 10) {
    cleaned = '62' + cleaned.substring(1);
  }

  // Bersihkan semua karakter selain digit
  return cleaned.replace(/\D/g, '');
}

/**
 * Mendapatkan display name kontak dengan prioritas:
 * 1. custom_name
 * 2. whatsapp_name
 * 3. phone
 */
export function getContactDisplayName(contact: {
  custom_name?: string | null;
  whatsapp_name?: string | null;
  phone: string;
}): string {
  if (contact.custom_name && contact.custom_name.trim() !== '') {
    return contact.custom_name.trim();
  }
  if (contact.whatsapp_name && contact.whatsapp_name.trim() !== '') {
    return contact.whatsapp_name.trim();
  }
  return contact.phone;
}

/**
 * Ekstraksi nomor telepon murni dari JID WhatsApp
 */
export function extractPhoneFromJid(jid: string): string {
  const parts = jid.split('@')[0];
  const withoutDevice = parts.split(':')[0];
  return normalizePhone(withoutDevice);
}

/**
 * Catat perubahan riwayat kategori kontak
 */
export async function recordCategoryHistory(
  client: PoolClient,
  contactId: string,
  oldCategory: string | null,
  newCategory: string,
  source: CategorySource,
  reason: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO contact_category_history (
      contact_id, old_category, new_category, source, reason
    ) VALUES ($1, $2, $3, $4, $5);`,
    [contactId, oldCategory, newCategory, source, reason]
  );
}

/**
 * Menemukan atau membuat Kontak baru di database PostgreSQL secara transaksional
 * Rules:
 * - Anti duplicate (menggunakan unique constraint & ON CONFLICT)
 * - whatsapp_name diperbarui jika berbeda
 * - custom_name TIDAK PERNAH ditimpa jika sudah diisi admin
 * - Jika category_source saat ini adalah 'ADMIN' atau 'MANUAL', classifier TIDAK BOLEH menimpa kategori
 * - Kategori awal dideteksi via contactClassifier.ts
 * - Default: category = UNKNOWN, category_source = DEFAULT (atau PATTERN jika match), ai_enabled = false, ai_mode = OFF
 */
export async function findOrCreateContact(
  phone: string,
  jid: string,
  whatsappName: string | null,
  externalClient?: PoolClient
): Promise<ContactRecord> {
  const normalized = normalizePhone(phone);
  const client = externalClient || (await dbPool.connect());
  const shouldRelease = !externalClient;

  try {
    // 1. Cari kontak berdasarkan phone atau whatsapp_jid
    const existingResult = await client.query<ContactRecord>(
      'SELECT * FROM contacts WHERE phone = $1 OR whatsapp_jid = $2 LIMIT 1;',
      [normalized, jid]
    );

    if (existingResult.rows.length > 0) {
      const contact = existingResult.rows[0];
      let needsUpdate = false;
      let newWhatsappName = contact.whatsapp_name;
      let targetCategory = contact.category;
      let targetSource = contact.category_source;

      // Update whatsapp_name jika berubah
      if (whatsappName && contact.whatsapp_name !== whatsappName) {
        newWhatsappName = whatsappName;
        needsUpdate = true;
      }

      // Evaluasi klasifikasi ulang HANYA jika bukan ADMIN / MANUAL override
      if (contact.category_source !== 'ADMIN' && contact.category_source !== 'MANUAL') {
        const classification = classifyContactName(newWhatsappName);
        if (classification.source === 'PATTERN' && contact.category !== classification.category) {
          await recordCategoryHistory(
            client,
            contact.id,
            contact.category,
            classification.category,
            classification.source,
            classification.reason
          );
          targetCategory = classification.category;
          targetSource = classification.source;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        const updated = await client.query<ContactRecord>(
          `UPDATE contacts 
           SET whatsapp_name = $1, category = $2, category_source = $3, 
               last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4 
           RETURNING *;`,
          [newWhatsappName, targetCategory, targetSource, contact.id]
        );
        logger.info(
          `[CONTACT] Contact updated: ${normalized} (Name: ${newWhatsappName}, Category: ${targetCategory}, Source: ${targetSource})`
        );
        return updated.rows[0];
      }

      // Update waktu aktivitas terakhir
      await client.query(
        'UPDATE contacts SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;',
        [contact.id]
      );

      return contact;
    }

    // 2. Kontak baru
    const classification = classifyContactName(whatsappName);
    const initialCategory = classification.category;
    const initialSource = classification.source;

    const insertResult = await client.query<ContactRecord>(
      `INSERT INTO contacts (
        phone, whatsapp_jid, whatsapp_name, custom_name,
        category, category_source, ai_enabled, ai_mode,
        notes, first_message_at, last_message_at
      ) VALUES (
        $1, $2, $3, NULL,
        $4, $5, FALSE, 'OFF',
        NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (phone) DO UPDATE 
        SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      RETURNING *;`,
      [normalized, jid, whatsappName, initialCategory, initialSource]
    );

    const newContact = insertResult.rows[0];

    // Catat histori awal kategori
    await recordCategoryHistory(
      client,
      newContact.id,
      null,
      initialCategory,
      initialSource,
      classification.reason
    );

    logger.info(
      `\n[CONTACT] New contact detected:\n` +
      `Phone   : ${newContact.phone}\n` +
      `Name    : ${newContact.whatsapp_name || 'None'}\n` +
      `Category: ${newContact.category}\n` +
      `Source  : ${newContact.category_source}\n` +
      `Reason  : ${classification.reason}`
    );

    return newContact;
  } catch (error: any) {
    logger.error({ err: error.message, phone, jid }, '[CONTACT] Error saat mencari atau membuat kontak');
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Admin Override: Memperbarui kontak secara manual
 * Memberikan category_source = 'ADMIN' agar tidak pernah ditimpa pattern classifier
 */
export async function updateContact(
  contactId: string,
  payload: UpdateContactPayload
): Promise<ContactRecord> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // Ambil data kontak saat ini
    const currentResult = await client.query<ContactRecord>(
      'SELECT * FROM contacts WHERE id = $1 FOR UPDATE;',
      [contactId]
    );

    if (currentResult.rows.length === 0) {
      throw new Error(`Kontak dengan ID ${contactId} tidak ditemukan`);
    }

    const current = currentResult.rows[0];
    const newCategory = payload.category ?? current.category;
    const categoryChanged = payload.category && payload.category !== current.category;
    const newSource: CategorySource = categoryChanged ? 'ADMIN' : current.category_source;

    // Catat ke riwayat jika kategori diubah oleh admin
    if (categoryChanged) {
      await recordCategoryHistory(
        client,
        contactId,
        current.category,
        newCategory,
        'ADMIN',
        payload.notes || 'Ditentukan oleh admin'
      );
      logger.info(`[CONTACT] Admin override category: ${current.category} -> ${newCategory} for ${current.phone}`);
    }

    const customNameVal = payload.customName !== undefined ? payload.customName : current.custom_name;
    const aiModeVal = payload.aiMode !== undefined ? payload.aiMode : current.ai_mode;
    const aiEnabledVal = payload.aiEnabled !== undefined ? payload.aiEnabled : current.ai_enabled;
    const notesVal = payload.notes !== undefined ? payload.notes : current.notes;

    const updateResult = await client.query<ContactRecord>(
      `UPDATE contacts
       SET custom_name = $1,
           category = $2,
           category_source = $3,
           ai_mode = $4,
           ai_enabled = $5,
           notes = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *;`,
      [customNameVal, newCategory, newSource, aiModeVal, aiEnabledVal, notesVal, contactId]
    );

    await client.query('COMMIT');
    logger.info(`[CONTACT] Contact updated by Admin: ${current.phone}`);
    return updateResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error }, '[CONTACT] Gagal mengupdate kontak');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Pencarian Kontak berdasarkan nama (whatsapp_name atau custom_name), nomor telepon, atau kategori
 */
export async function searchContacts(query: string): Promise<ContactRecord[]> {
  const client = await dbPool.connect();
  try {
    const q = `%${query.trim()}%`;
    const result = await client.query<ContactRecord>(
      `SELECT * FROM contacts 
       WHERE phone ILIKE $1 
          OR whatsapp_name ILIKE $1 
          OR custom_name ILIKE $1 
          OR category ILIKE $1 
       ORDER BY last_message_at DESC LIMIT 50;`,
      [q]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Mengambil kontak berdasarkan ID
 */
export async function getContactById(id: string): Promise<ContactRecord | null> {
  const client = await dbPool.connect();
  try {
    const result = await client.query<ContactRecord>(
      'SELECT * FROM contacts WHERE id = $1 LIMIT 1;',
      [id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

/**
 * Mengambil daftar semua kontak dengan paginasi
 */
export async function getAllContacts(limit = 50, offset = 0): Promise<ContactRecord[]> {
  const client = await dbPool.connect();
  try {
    const result = await client.query<ContactRecord>(
      'SELECT * FROM contacts ORDER BY last_message_at DESC LIMIT $1 OFFSET $2;',
      [limit, offset]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
