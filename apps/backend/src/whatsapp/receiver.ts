import { WAMessage } from '@whiskeysockets/baileys';
import { dbPool } from '../config/database';
import { logger } from '../utils/logger';
import { extractPhoneFromJid, findOrCreateContact } from './contacts';
import { findOrCreateConversation, saveMessageRecord } from './conversations';
import { IncomingMessagePayload } from './types';

/**
 * Ekstraksi teks pesan dari berbagai kemungkinan format payload Baileys
 */
export function extractTextFromWAMessage(msg: WAMessage): string | null {
  const message = msg.message;
  if (!message) return null;

  // Text biasa
  if (message.conversation) {
    return message.conversation;
  }
  // Extended text (misal balasan/reply, link preview, dsb.)
  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }
  // Caption pada gambar
  if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  }
  // Caption pada video
  if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  }
  return null;
}

/**
 * Memproses pesan masuk (incoming message) secara transaksional
 * Menjalankan alur:
 * 1. Filter broadcast & group
 * 2. Ekstraksi pengirim & pesan
 * 3. Eksekusi database transaction: findOrCreateContact -> findOrCreateConversation -> saveMessageRecord
 * 4. Commit dan catat log
 */
export async function processIncomingMessage(
  msg: WAMessage,
  myPhone: string
): Promise<void> {
  const key = msg.key;
  if (!key || !key.remoteJid) return;

  // Abaikan status stories WhatsApp
  if (key.remoteJid === 'status@broadcast') return;

  // Abaikan pesan grup pada tahap ini
  if (key.remoteJid.endsWith('@g.us')) {
    logger.debug(`[WHATSAPP] Mengabaikan pesan dari grup: ${key.remoteJid}`);
    return;
  }

  const messageText = extractTextFromWAMessage(msg);
  if (!messageText || messageText.trim() === '') {
    return;
  }

  const isFromMe = Boolean(key.fromMe);
  const remoteJid = key.remoteJid;
  const senderPhone = extractPhoneFromJid(remoteJid);
  const senderName = msg.pushName || null;
  const messageId = key.id || `gen_${Date.now()}`;
  const timestamp = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000)
    : new Date();

  const payload: IncomingMessagePayload = {
    messageId,
    senderJid: remoteJid,
    senderPhone,
    senderName,
    text: messageText.trim(),
    timestamp,
    isFromMe,
  };

  // Format log spesifik
  if (!isFromMe) {
    logger.info(
      `\n=======================================================\n` +
      `📥 [MSG IN]\n` +
      `From   : ${payload.senderPhone}\n` +
      `Name   : ${payload.senderName || 'Tidak Diketahui'}\n` +
      `Message: ${payload.text}\n` +
      `=======================================================`
    );
  } else {
    logger.info(`[MSG OUT (SYNC)] ${payload.senderPhone}: ${payload.text}`);
  }

  // Operasi Database Transaksional
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Cari atau buat kontak di PostgreSQL
    const contact = await findOrCreateContact(
      payload.senderPhone,
      payload.senderJid,
      payload.senderName,
      client
    );

    // 2. Cari atau buat percakapan (conversation)
    const conversation = await findOrCreateConversation(contact.id, client);

    // 3. Simpan pesan ke tabel messages (membedakan USER dan ADMIN secara akurat)
    await saveMessageRecord(
      {
        conversationId: conversation.id,
        messageId: payload.messageId,
        direction: isFromMe ? 'OUTGOING' : 'INCOMING',
        senderType: isFromMe ? 'ADMIN' : 'USER',
        senderPhone: isFromMe ? myPhone : payload.senderPhone,
        receiverPhone: isFromMe ? payload.senderPhone : myPhone,
        messageType: 'TEXT',
        messageText: payload.text,
        timestamp: payload.timestamp,
        isFromMe,
      },
      client
    );

    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error({ err: error.message, messageId }, '[WHATSAPP RECEIVER] Gagal memproses pesan secara transaksional');
  } finally {
    client.release();
  }
}
