import { ContactCategory, CategorySource } from './types';

export interface ClassificationResult {
  category: ContactCategory;
  source: CategorySource;
  reason: string;
}

// Pola konfigurasi awal berbasis kata / token
export const BUSINESS_PATTERNS = [
  'kons valis',
  'cust',
  'customer',
  'client',
];

export const SUPPLIER_PATTERNS = [
  'supplier',
  'vendor',
];

/**
 * Memeriksa apakah sebuah pola cocok sebagai kata utuh (word boundary/token match).
 * Mencegah kesalahan matching contoh: "Acustik" tidak boleh cocok dengan "cust".
 */
function matchWordBoundary(text: string, pattern: string): boolean {
  // Jika pattern memiliki spasi (contoh: "kons valis")
  if (pattern.includes(' ')) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s|[._\\-])${escaped}(?:$|\\s|[._\\-])`, 'i');
    return regex.test(text);
  }

  // Tokenize berdasarkan spasi dan tanda baca umum
  const tokens = text.toLowerCase().split(/[\s,._\-+/|\\()]+/);
  return tokens.includes(pattern.toLowerCase());
}

/**
 * Mengklasifikasikan nama kontak menjadi kategori awal:
 * - "Kons Valis Budi" -> BUSINESS
 * - "Cust Joko" -> BUSINESS
 * - "Customer Toko Makmur" -> BUSINESS
 * - "Supplier Sumber Jaya" -> SUPPLIER
 * - "Pak Budi" -> UNKNOWN
 * - "Acustik Studio" -> UNKNOWN (karena 'cust' bukan token mandiri)
 */
export function classifyContactName(name: string | null | undefined): ClassificationResult {
  if (!name || name.trim() === '') {
    return {
      category: 'UNKNOWN',
      source: 'DEFAULT',
      reason: 'Nama kontak kosong',
    };
  }

  const cleanName = name.trim();

  // 1. Cek Pola Bisnis
  for (const pattern of BUSINESS_PATTERNS) {
    if (matchWordBoundary(cleanName, pattern)) {
      return {
        category: 'BUSINESS',
        source: 'PATTERN',
        reason: `Matched pattern: "${pattern}"`,
      };
    }
  }

  // 2. Cek Pola Supplier
  for (const pattern of SUPPLIER_PATTERNS) {
    if (matchWordBoundary(cleanName, pattern)) {
      return {
        category: 'SUPPLIER',
        source: 'PATTERN',
        reason: `Matched pattern: "${pattern}"`,
      };
    }
  }

  // 3. Default: Nama biasa tetap UNKNOWN (JANGAN langsung diasumsikan PERSONAL)
  return {
    category: 'UNKNOWN',
    source: 'DEFAULT',
    reason: 'Tidak ada pattern yang cocok, ditetapkan sebagai UNKNOWN',
  };
}
