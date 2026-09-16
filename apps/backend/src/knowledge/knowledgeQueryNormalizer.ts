import type { KnowledgeQuery } from './types';
export function normalizeKnowledgeQuery(input:string): KnowledgeQuery {
  const normalized = String(input ?? '').toLowerCase().normalize('NFKD').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
  const price = /\b(harga|biaya|piro|berapa|regane|mulai)\b/.test(normalized);
  const service = /\b(pasang|pemasangan|service|servis|perbaikan|maintenance|survey|konfigurasi|setting)\b/.test(normalized);
  const faq = /\b(bisa|apakah|tersedia|melayani)\b/.test(normalized);
  let category: string|undefined;
  if (/\b(cctv|kamera|camera|dvr|nvr)\b/.test(normalized)) category='CCTV';
  else if (/\b(kasir|pos)\b/.test(normalized)) category='CASHIER';
  else if (/\b(komputer|pc|laptop)\b/.test(normalized)) category='COMPUTER';
  let intent: KnowledgeQuery['intent'] = price ? 'PRICE_INQUIRY' : service ? 'SERVICE' : faq ? 'FAQ' : 'GENERAL';
  if (/\b(ada|tersedia)\b/.test(normalized) && !price) intent='AVAILABILITY';
  const quantityMatch = normalized.match(/\b(\d+)\s*(kamera|cctv|unit)\b/);
  return { normalized, intent, category, quantity: quantityMatch ? Number(quantityMatch[1]) : undefined };
}
