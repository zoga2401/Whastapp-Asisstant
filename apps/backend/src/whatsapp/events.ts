import { BaileysEventMap, DisconnectReason, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger';
import { processIncomingMessage } from './receiver';
import { setActiveSocket } from './sender';
import { extractPhoneFromJid } from './contacts';
import { parseIncomingMessage } from './messageParser';
import { processAutoReply } from './autoReplyEngine';

interface EventHandlersOptions {
  sock: WASocket;
  saveCreds: () => Promise<void>;
  onReconnectRequired: () => void;
  onConnected: () => void;
}

/**
 * Mendaftarkan semua event listener Baileys
 */
export function registerWhatsAppEvents({
  sock,
  saveCreds,
  onReconnectRequired,
  onConnected,
}: EventHandlersOptions): void {
  // Simpan update kredensial ke disk
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err: any) {
      logger.error({ err: err.message }, '[WHATSAPP] Gagal menyimpan update credentials');
    }
  });

  // Pantau perubahan status koneksi (QR, Connected, Disconnected)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Tampilkan QR Code di terminal jika pairing dibutuhkan
    if (qr) {
      logger.info('[WHATSAPP] QR Code dibuat. Silakan scan melalui aplikasi WhatsApp di HP:');
      qrcode.generate(qr, { small: true });
      logger.info('[WHATSAPP] Menunggu scan QR code...');
    }

    if (connection === 'connecting') {
      logger.info('[WHATSAPP] Menghubungkan ke server WhatsApp Web...');
    }

    if (connection === 'open') {
      logger.info('=======================================================');
      logger.info('✅ [WHATSAPP] Status: Connected! Siap menerima pesan.');
      logger.info('=======================================================');
      setActiveSocket(sock);
      onConnected();
    }

    if (connection === 'close') {
      setActiveSocket(null);
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn(`[WHATSAPP] Disconnected! Status code: ${statusCode || 'Unknown'}`);

      if (isLoggedOut) {
        logger.error(
          '[WHATSAPP] Perangkat telah keluar (Logged Out). Hapus folder session_baileys jika ingin scan QR ulang.'
        );
      } else {
        logger.info('[WHATSAPP] Mencoba reconnecting secara aman...');
        onReconnectRequired();
      }
    }
  });

  // Tangani pesan baru (messages.upsert)
  sock.ev.on('messages.upsert', async (upsert) => {
    // Hanya tangani tipe notify (pesan langsung masuk)
    if (upsert.type !== 'notify') return;

    // Dapatkan nomor HP milik akun WhatsApp kita sendiri
    const myJid = sock.user?.id || '';
    const myPhone = myJid ? extractPhoneFromJid(myJid) : 'ME';

    for (const msg of upsert.messages) {
      await processIncomingMessage(msg, myPhone);
      const parsed = parseIncomingMessage(msg, myPhone);
      if (parsed.accepted) {
        await processAutoReply(parsed.payload, sock);
      }
    }
  });
}
