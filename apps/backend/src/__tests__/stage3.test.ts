import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, getContactDisplayName, extractPhoneFromJid } from '../whatsapp/contacts';
import { classifyContactName, BUSINESS_PATTERNS, SUPPLIER_PATTERNS } from '../whatsapp/contactClassifier';

describe('normalizePhone()', () => {
  it('mengubah 08xxx menjadi 628xxx', () => { assert.equal(normalizePhone('081234567890'), '6281234567890'); });
  it('mempertahankan 628xxx', () => { assert.equal(normalizePhone('6281234567890'), '6281234567890'); });
  it('menghapus tanda + dari +628xxx', () => { assert.equal(normalizePhone('+6281234567890'), '6281234567890'); });
  it('tidak merusak nomor US', () => { assert.equal(normalizePhone('+14155552671'), '14155552671'); });
  it('tidak merusak nomor UK', () => { assert.equal(normalizePhone('+44712345678'), '44712345678'); });
  it('membersihkan tanda hubung', () => { assert.equal(normalizePhone('+62-812-3456-7890'), '6281234567890'); });
});

describe('getContactDisplayName()', () => {
  it('mengembalikan custom_name', () => {
    assert.equal(getContactDisplayName({ custom_name: 'Pak Budi CCTV', whatsapp_name: 'Budi', phone: '628123' }), 'Pak Budi CCTV');
  });
  it('mengembalikan whatsapp_name jika custom_name null', () => {
    assert.equal(getContactDisplayName({ custom_name: null, whatsapp_name: 'Budi', phone: '628123' }), 'Budi');
  });
  it('mengembalikan whatsapp_name jika custom_name kosong', () => {
    assert.equal(getContactDisplayName({ custom_name: '', whatsapp_name: 'Budi', phone: '628123' }), 'Budi');
  });
  it('mengembalikan phone jika keduanya null', () => {
    assert.equal(getContactDisplayName({ custom_name: null, whatsapp_name: null, phone: '628123456789' }), '628123456789');
  });
  it('mengembalikan phone jika keduanya kosong', () => {
    assert.equal(getContactDisplayName({ custom_name: '', whatsapp_name: '', phone: '628123456789' }), '628123456789');
  });
});

describe('classifyContactName() - Pattern Detection', () => {
  it('Kons Valis Budi -> BUSINESS', () => { const r = classifyContactName('Kons Valis Budi'); assert.equal(r.category, 'BUSINESS'); assert.equal(r.source, 'PATTERN'); });
  it('Cust Joko -> BUSINESS', () => { const r = classifyContactName('Cust Joko'); assert.equal(r.category, 'BUSINESS'); });
  it('Customer Toko Makmur -> BUSINESS', () => { const r = classifyContactName('Customer Toko Makmur'); assert.equal(r.category, 'BUSINESS'); });
  it('client Ahmad -> BUSINESS case-insensitive', () => { assert.equal(classifyContactName('client Ahmad').category, 'BUSINESS'); });
  it('CUST Wijaya -> BUSINESS uppercase', () => { assert.equal(classifyContactName('CUST Wijaya').category, 'BUSINESS'); });
  it('Supplier Sumber Jaya -> SUPPLIER', () => { const r = classifyContactName('Supplier Sumber Jaya'); assert.equal(r.category, 'SUPPLIER'); assert.equal(r.source, 'PATTERN'); });
  it('Vendor Elektronik -> SUPPLIER', () => { assert.equal(classifyContactName('Vendor Elektronik').category, 'SUPPLIER'); });
  it('Pak Budi -> UNKNOWN', () => { const r = classifyContactName('Pak Budi'); assert.equal(r.category, 'UNKNOWN'); assert.equal(r.source, 'DEFAULT'); });
  it('Rina -> UNKNOWN', () => { assert.equal(classifyContactName('Rina').category, 'UNKNOWN'); });
  it('Acustik Studio -> UNKNOWN (false positive prevention)', () => { assert.equal(classifyContactName('Acustik Studio').category, 'UNKNOWN'); });
  it('Ahmad Fajar -> UNKNOWN bukan PERSONAL', () => { const r = classifyContactName('Ahmad Fajar'); assert.notEqual(r.category, 'PERSONAL'); assert.equal(r.category, 'UNKNOWN'); });
  it('null -> UNKNOWN', () => { assert.equal(classifyContactName(null).category, 'UNKNOWN'); });
  it('kosong -> UNKNOWN', () => { assert.equal(classifyContactName('').category, 'UNKNOWN'); });
});

describe('extractPhoneFromJid()', () => {
  it('JID standar', () => { assert.equal(extractPhoneFromJid('628123456789@s.whatsapp.net'), '628123456789'); });
  it('JID dengan device suffix', () => { assert.equal(extractPhoneFromJid('628123456789:5@s.whatsapp.net'), '628123456789'); });
});

describe('Pattern Extendability', () => {
  it('BUSINESS_PATTERNS berisi pola yang benar', () => {
    assert.ok(Array.isArray(BUSINESS_PATTERNS));
    assert.ok(BUSINESS_PATTERNS.includes('kons valis'));
    assert.ok(BUSINESS_PATTERNS.includes('cust'));
    assert.ok(BUSINESS_PATTERNS.includes('customer'));
    assert.ok(BUSINESS_PATTERNS.includes('client'));
  });
  it('SUPPLIER_PATTERNS berisi pola yang benar', () => {
    assert.ok(Array.isArray(SUPPLIER_PATTERNS));
    assert.ok(SUPPLIER_PATTERNS.includes('supplier'));
    assert.ok(SUPPLIER_PATTERNS.includes('vendor'));
  });
});
