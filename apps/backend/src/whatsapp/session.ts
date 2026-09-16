import { useMultiFileAuthState, AuthenticationState } from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

// Lokasi folder penyimpanan session Baileys
const SESSION_DIR_NAME = 'session_baileys';
export const SESSION_DIR = path.resolve(__dirname, '../../../../', SESSION_DIR_NAME);

/**
 * Inisialisasi Auth State Multi-File
 * Membaca session yang sudah tersimpan agar tidak perlu scan QR ulang setelah restart.
 */
export async function getWhatsAppAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      logger.info(`[WHATSAPP SESSION] Membuat direktori session baru di: ${SESSION_DIR}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    return { state, saveCreds };
  } catch (error: any) {
    logger.error({ err: error.message }, '[WHATSAPP SESSION] Gagal menginisialisasi authentication state');
    throw error;
  }
}

/**
 * Memeriksa apakah session sudah pernah disimpan sebelumnya
 */
export function hasExistingSession(): boolean {
  if (!fs.existsSync(SESSION_DIR)) return false;
  const files = fs.readdirSync(SESSION_DIR);
  // Baileys menyimpan creds.json saat login berhasil
  return files.includes('creds.json');
}
