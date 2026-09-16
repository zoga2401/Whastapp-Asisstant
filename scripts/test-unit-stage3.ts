import { normalizePhone, getContactDisplayName } from '../apps/backend/src/whatsapp/contacts';
import { classifyContactName } from '../apps/backend/src/whatsapp/contactClassifier';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    if (detail) console.error(`   Detail: ${detail}`);
    failed++;
  }
}

console.log('=======================================================');
console.log('🧪 UNIT TESTING TAHAP 3: CONTACT INTELLIGENCE');
console.log('=======================================================\n');

// 1. Pengujian normalizePhone()
console.log('--- 1. Testing normalizePhone() ---');
assert(normalizePhone('081234567890') === '6281234567890', 'Format lokal 08xxx menjadi 628xxx');
assert(normalizePhone('+6281234567890') === '6281234567890', 'Format +628xxx menjadi 628xxx');
assert(normalizePhone('6281234567890') === '6281234567890', 'Format sudah 628xxx dipertahankan');
assert(normalizePhone('+14155552671') === '14155552671', 'Nomor internasional AS (+1) tetap aman');
assert(normalizePhone('+447123456789') === '447123456789', 'Nomor internasional UK (+44) tetap aman');

// 2. Pengujian getContactDisplayName()
console.log('\n--- 2. Testing getContactDisplayName() ---');
assert(
  getContactDisplayName({ custom_name: 'Pak Budi CCTV', whatsapp_name: 'Budi', phone: '628123' }) === 'Pak Budi CCTV',
  'Prioritas 1: custom_name'
);
assert(
  getContactDisplayName({ custom_name: null, whatsapp_name: 'Budi', phone: '628123' }) === 'Budi',
  'Prioritas 2: whatsapp_name jika custom_name null'
);
assert(
  getContactDisplayName({ custom_name: '', whatsapp_name: '', phone: '628123456789' }) === '628123456789',
  'Prioritas 3: phone jika keduanya kosong'
);

// 3. Pengujian Pola Klasifikasi Kontak (contactClassifier.ts)
console.log('\n--- 3. Testing Pattern Classification ---');

const test1 = classifyContactName('Kons Valis Budi');
assert(test1.category === 'BUSINESS' && test1.source === 'PATTERN', '"Kons Valis Budi" -> BUSINESS (PATTERN)');

const test2 = classifyContactName('Cust Joko');
assert(test2.category === 'BUSINESS' && test2.source === 'PATTERN', '"Cust Joko" -> BUSINESS (PATTERN)');

const test3 = classifyContactName('Customer Toko Makmur');
assert(test3.category === 'BUSINESS' && test3.source === 'PATTERN', '"Customer Toko Makmur" -> BUSINESS (PATTERN)');

const test4 = classifyContactName('Client Pak Hendra');
assert(test4.category === 'BUSINESS' && test4.source === 'PATTERN', '"Client Pak Hendra" -> BUSINESS (PATTERN)');

const test5 = classifyContactName('Supplier Sumber Jaya');
assert(test5.category === 'SUPPLIER' && test5.source === 'PATTERN', '"Supplier Sumber Jaya" -> SUPPLIER (PATTERN)');

const test6 = classifyContactName('Vendor Kabel Fiber');
assert(test6.category === 'SUPPLIER' && test6.source === 'PATTERN', '"Vendor Kabel Fiber" -> SUPPLIER (PATTERN)');

const test7 = classifyContactName('Pak Budi');
assert(test7.category === 'UNKNOWN' && test7.source === 'DEFAULT', '"Pak Budi" -> UNKNOWN (Bukan PERSONAL!)');

const test8 = classifyContactName('Rina');
assert(test8.category === 'UNKNOWN' && test8.source === 'DEFAULT', '"Rina" -> UNKNOWN (Bukan PERSONAL!)');

// 4. Pengujian Word Boundary (Token Matching - Bukan sekadar string contains)
console.log('\n--- 4. Testing Token Boundary (Anti False-Positive) ---');
const test9 = classifyContactName('Acustik Studio');
assert(
  test9.category === 'UNKNOWN',
  '"Acustik Studio" -> UNKNOWN (Mencegah "cust" di dalam "Acustik" terdeteksi bisnis)'
);

const test10 = classifyContactName('Cust-Andi');
assert(test10.category === 'BUSINESS', '"Cust-Andi" dengan tanda hubung tetap dikenali tokennya');

console.log('\n=======================================================');
console.log(`HASIL: ${passed} Passed, ${failed} Failed`);
console.log('=======================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
