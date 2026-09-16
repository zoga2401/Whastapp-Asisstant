import { WASocket } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger';
import { normalizePhone, findOrCreateContact } from './contacts';
import { findOrCreateConversation, saveMessageRecord } from './conversations';
import { MessageRecord } from './types';

// State referensi socket Baileys yang sedang aktif
let activeSocket: WASocket | null = null;

// Rate limiting dasar: interval minimum antar pengiriman pesan manual (1.5 detik)
let lastSentTime = 0;
const MIN_SEND_INTERVAL_MS = 1500;

export function setActiveSocket(sock: WASocket | null): void {
  activeSocket = sock;
}

export function getActiveSocket(): WASocket | null {
  return activeSocket;
}

/**
 * Mengirim pesan teks secara programmatic/manual ke nomor WhatsApp.
 * Dilengkapi dengan:
 * - Validasi nomor telepon
 * - Proteksi rate limit wajar
 * - Pencatatan ke tabel messages sebagai OUTGOING
 * - Tanpa spam atau broadcast massal
 */
export async function sendTextMessage(
  rawPhone: string,
  text: string,
  myPhone = 'ME'
): Promise<MessageRecord> {
  if (!activeSocket) {
    throw new Error('WhatsApp socket belum terhubung atau sedang reconnecting');
  }

  if (!rawPhone || rawPhone.trim() === '') {
    throw new Error('Nomor tujuan tidak boleh kosong');
  }

  if (!text || text.trim() === '') {
    throw new Error('Isi pesan tidak boleh kosong');
  }

  // 1. Normalisasi nomor tujuan
  const cleanPhone = normalizePhone(rawPhone);
  if (cleanPhone.length < 9 || cleanPhone.length > 15) {
    throw new Error(`Nomor telepon tidak valid: ${rawPhone}`);
  }

  const recipientJid = `${cleanPhone}@s.whatsapp.net`;

  // 2. Rate limit sederhana untuk menjaga keamanan akun
  const now = Date.now();
  const timeSinceLastSend = now - lastSentTime;
  if (timeSinceLastSend < MIN_SEND_INTERVAL_MS) {
    const delay = MIN_SEND_INTERVAL_MS - timeSinceLastSend;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  try {
    logger.info(`[MSG OUT] Mengirim pesan ke ${cleanPhone}...`);

    // 3. Kirim via Baileys socket
    const sentMsg = await activeSocket.sendMessage(recipientJid, {
      text: text.trim(),
    });

    lastSentTime = Date.now();
    const messageId = sentMsg?.key?.id || `out_${Date.now()}`;
    const timestamp = new Date();

    logger.info(`[MSG OUT] Berhasil terkirim ke ${cleanPhone} (ID: ${messageId})`);

    // 4. Pastikan kontak & percakapan tersedia di database
    const contact = await findOrCreateContact(cleanPhone, recipientJid, null);
    const conversation = await findOrCreateConversation(contact.id);

    // 5. Simpan ke tabel messages sebagai OUTGOING (ADMIN)
    const saved = await saveMessageRecord({
      conversationId: conversation.id,
      messageId,
      direction: 'OUTGOING',
      senderType: 'ADMIN',
      senderPhone: myPhone,
      receiverPhone: cleanPhone,
      messageType: 'TEXT',
      messageText: text.trim(),
      timestamp,
      isFromMe: true,
    });

    return saved;
  } catch (error: any) {
    logger.error({ err: error.message, recipientPhone: cleanPhone }, '[WHATSAPP SENDER] Gagal mengirim pesan');
    throw error;
  }
}
