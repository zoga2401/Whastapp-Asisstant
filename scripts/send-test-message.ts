import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { sendTextMessage } from '../apps/backend/src/whatsapp/sender';

const rootEnv = path.resolve(__dirname, '../.env');
dotenv.config({ path: rootEnv });

const targetPhone = process.argv[2] || process.env.ADMIN_PHONE_NUMBER;
const testMessage = process.argv[3] || 'Halo! Ini adalah pesan pengujian keluar (manual test) dari Zoga Assistant Backend.';

async function runSendTest() {
  if (!targetPhone) {
    console.error('❌ Harap tentukan nomor tujuan!');
    console.error('Penggunaan: npm run test:send <nomor_tujuan> "[pesan_opsional]"');
    console.error('Contoh: npm run test:send 628123456789 "Halo pengujian"');
    process.exit(1);
  }

  console.log('---------------------------------------------------------');
  console.log('📤 PENGUJIAN PENGIRIMAN PESAN MANUAL (PROGRAMMATIC TEST)');
  console.log('---------------------------------------------------------');
  console.log(`Nomor Tujuan : ${targetPhone}`);
  console.log(`Pesan        : "${testMessage}"`);
  console.log('Mengirim...');

  try {
    const result = await sendTextMessage(targetPhone, testMessage);
    console.log('\n✅ PESAN BERHASIL DIKIRIM & DICATAT KE DATABASE!');
    console.log(`Message ID   : ${result.message_id}`);
    console.log(`Arah         : ${result.direction}`);
    console.log(`Waktu Kirim  : ${result.timestamp}`);
    console.log('---------------------------------------------------------');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ PENGIRIMAN GAGAL!');
    console.error(`Pesan Error  : ${error.message}`);
    console.error('\nCatatan: Pastikan server backend sedang berjalan dan status WhatsApp sudah Connected.');
    console.error('---------------------------------------------------------');
    process.exit(1);
  }
}

runSendTest();
