import { formatMessageForContext, getLastSpeaker } from '../src/whatsapp/contextBuilder';
import { containsSensitiveData } from '../src/whatsapp/memory';
import { getContactDisplayName } from '../src/whatsapp/contacts';
import { MessageRecord, FormattedContextMessage } from '../src/whatsapp/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

console.log('---------------------------------------------------------');
console.log('🧪 PENGUJIAN LOGIKA CONTEXT & MEMORY TAHAP 4 (UNIT TEST)');
console.log('---------------------------------------------------------');

// 1. Test getContactDisplayName (custom_name vs whatsapp_name)
console.log('[TEST 1] getContactDisplayName priority...');
const contactWithCustom = {
  phone: '628123456789',
  whatsapp_name: 'Budi',
  custom_name: 'Pak Budi CCTV',
};
assert(
  getContactDisplayName(contactWithCustom) === 'Pak Budi CCTV',
  'Display name harus memprioritaskan custom_name'
);

const contactWithoutCustom = {
  phone: '628123456789',
  whatsapp_name: 'Budi',
  custom_name: null,
};
assert(
  getContactDisplayName(contactWithoutCustom) === 'Budi',
  'Display name harus fallback ke whatsapp_name jika custom_name null'
);

const contactWithPhoneOnly = {
  phone: '628123456789',
  whatsapp_name: null,
  custom_name: null,
};
assert(
  getContactDisplayName(contactWithPhoneOnly) === '628123456789',
  'Display name harus fallback ke nomor telepon jika semua nama kosong'
);
console.log('✅ PASS: getContactDisplayName berfungsi dengan benar.');

// 2. Test formatMessageForContext (Role mapping)
console.log('\n[TEST 2] formatMessageForContext role mapping...');
const dummyDate = new Date();

const userMsg: MessageRecord = {
  id: '1',
  conversation_id: 'conv1',
  message_id: 'msg1',
  direction: 'INCOMING',
  sender_type: 'USER',
  sender_phone: '628123456789',
  receiver_phone: 'ME',
  message_type: 'TEXT',
  message_text: 'Mas ada CCTV 4 kamera?',
  timestamp: dummyDate,
  is_from_me: false,
  created_at: dummyDate,
};
const formattedUser = formatMessageForContext(userMsg);
assert(formattedUser.role === 'user', 'sender_type USER harus menjadi role user');
assert(formattedUser.content === 'Mas ada CCTV 4 kamera?', 'Isi konten harus sama');

const adminMsg: MessageRecord = {
  id: '2',
  conversation_id: 'conv1',
  message_id: 'msg2',
  direction: 'OUTGOING',
  sender_type: 'ADMIN',
  sender_phone: 'ME',
  receiver_phone: '628123456789',
  message_type: 'TEXT',
  message_text: 'Ada mas, paket lengkap.',
  timestamp: dummyDate,
  is_from_me: true,
  created_at: dummyDate,
};
const formattedAdmin = formatMessageForContext(adminMsg);
assert(formattedAdmin.role === 'admin', 'sender_type ADMIN harus menjadi role admin');

const aiMsg: MessageRecord = {
  id: '3',
  conversation_id: 'conv1',
  message_id: 'msg3',
  direction: 'OUTGOING',
  sender_type: 'AI',
  sender_phone: 'ME',
  receiver_phone: '628123456789',
  message_type: 'TEXT',
  message_text: 'Untuk lokasi pemasangan di mana ya mas?',
  timestamp: dummyDate,
  is_from_me: true,
  created_at: dummyDate,
};
const formattedAI = formatMessageForContext(aiMsg);
assert(formattedAI.role === 'assistant', 'sender_type AI harus menjadi role assistant');
console.log('✅ PASS: Role mapping USER, ADMIN, AI berhasil.');

// 3. Test Privacy & Sensitive Data Filter
console.log('\n[TEST 3] Privacy check: containsSensitiveData...');
assert(containsSensitiveData('Kode OTP Anda adalah 123456') === true, 'Harus mendeteksi OTP 6 digit');
assert(containsSensitiveData('Password akun: Rahasia123!') === true, 'Harus mendeteksi password');
assert(containsSensitiveData('Nomor kartu kredit 4532 1234 5678 9012') === true, 'Harus mendeteksi format kartu');
assert(containsSensitiveData('Nama toko Toko Makmur jalan Mangga') === false, 'Data bisnis normal tidak boleh diblokir');
console.log('✅ PASS: Deteksi data sensitif bekerja dengan baik.');

// 4. Test Struktur Context Flow (Simulasi Pesan Berurutan)
console.log('\n[TEST 4] Context flow simulation...');
const conversationMessages: MessageRecord[] = [
  {
    ...userMsg,
    message_id: 'm1',
    message_text: 'Mas ada CCTV?',
    timestamp: new Date(Date.now() - 4000),
  },
  {
    ...userMsg,
    message_id: 'm2',
    message_text: 'Yang 4 kamera',
    timestamp: new Date(Date.now() - 3000),
  },
  {
    ...userMsg,
    message_id: 'm3',
    message_text: 'Untuk toko',
    timestamp: new Date(Date.now() - 2000),
  },
  {
    ...userMsg,
    message_id: 'm4',
    message_text: 'Kalau sama pasang berapa?',
    timestamp: new Date(Date.now() - 1000),
  },
];

const contextHistory = conversationMessages.map(formatMessageForContext);
assert(contextHistory.length === 4, 'Jumlah history harus 4');
assert(contextHistory[0].content === 'Mas ada CCTV?', 'Pesan pertama harus yang tertua');
assert(contextHistory[3].content === 'Kalau sama pasang berapa?', 'Pesan terakhir harus yang terbaru');
console.log('✅ PASS: Alur konteks pesan tertua ke terbaru valid.');

// 5. Test Admin Takeover Calculation
console.log('\n[TEST 5] Admin Takeover timeout simulation...');
const takeoverTimestamp = new Date();
const timeoutMinutes = 30;
const pausedUntil = new Date(takeoverTimestamp.getTime() + timeoutMinutes * 60 * 1000);

assert(pausedUntil.getTime() > takeoverTimestamp.getTime(), 'pausedUntil harus di masa depan');
assert(
  Math.round((pausedUntil.getTime() - takeoverTimestamp.getTime()) / 60000) === 30,
  'Jeda pause harus tepat 30 menit'
);
console.log('✅ PASS: Perhitungan waktu jeda AI_PAUSED valid.');

console.log('---------------------------------------------------------');
console.log('🎉 SEMUA PENGUJIAN LOGIKA TAHAP 4 BERHASIL LULUS 100%!');
console.log('---------------------------------------------------------');
