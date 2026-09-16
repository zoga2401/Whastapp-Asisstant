import makeWASocket, { fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { logger } from '../utils/logger';
import { getWhatsAppAuthState } from './session';
import { registerWhatsAppEvents } from './events';

let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 60000; // Maksimal jeda 60 detik
let connectionStatus: 'starting' | 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';

export function getWhatsAppConnectionStatus(): typeof connectionStatus {
  return connectionStatus;
}

/**
 * Inisialisasi koneksi WhatsApp Baileys dengan backoff reconnect
 */
export async function initWhatsAppConnection(): Promise<void> {
  connectionStatus = 'starting';
  try {
    logger.info('[WHATSAPP] Memulai inisialisasi socket Baileys...');

    // Ambil auth state dari session disk
    const { state, saveCreds } = await getWhatsAppAuthState();

    // Dapatkan versi Baileys / WA Web terbaru
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`[WHATSAPP] Menggunakan Baileys versi v${version.join('.')}, isLatest: ${isLatest}`);

    // Buat logger silent/child khusus Baileys agar terminal tidak dipenuhi payload mentah
    const baileysLogger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false, // Ditangani secara eksplisit di events.ts dengan qrcode-terminal
      logger: baileysLogger,
      browser: ['Zoga Assistant', 'Chrome', '120.0.0.0'],
      syncFullHistory: false, // Ringan, jangan sinkronisasi chat lama yang membebani RAM
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
    });

    // Daftarkan event handler
    registerWhatsAppEvents({
      sock,
      saveCreds,
      onConnected: () => {
        reconnectAttempts = 0;
        isReconnecting = false;
        connectionStatus = 'connected';
      },
      onReconnectRequired: () => {
        handleSafeReconnect();
      },
    });

  } catch (error: any) {
    connectionStatus = 'disconnected';
    logger.error({ err: error.message }, '[WHATSAPP] Gagal menginisialisasi koneksi');
    handleSafeReconnect();
  }
}

/**
 * Reconnect dengan Exponential Backoff agar tidak terjadi looping cepat
 */
function handleSafeReconnect(): void {
  if (isReconnecting) return;
  isReconnecting = true;
  connectionStatus = 'reconnecting';

  reconnectAttempts++;
  // Exponential backoff: 3s, 6s, 12s, 24s ... max 60s
  const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);

  logger.info(`[WHATSAPP] Mencoba reconnect ke-${reconnectAttempts} dalam ${Math.round(delay / 1000)} detik...`);

  setTimeout(async () => {
    isReconnecting = false;
    await initWhatsAppConnection();
  }, delay);
}
