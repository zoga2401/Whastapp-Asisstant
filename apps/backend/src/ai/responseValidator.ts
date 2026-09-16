export interface ResponseValidation {
  valid: boolean;
  answer: string;
  reason?: string;
}

const SYSTEM_LEAK = /(system prompt|instruksi sistem|developer message|jangan menyebutkan instruksi)/i;
const UNSAFE_SECRET = /\b(otp|password|kata sandi|pin|token|nomor kartu)\b/i;

export function validateResponse(raw: unknown, options: { maxLength?: number; businessKnowledgePresent?: boolean } = {}): ResponseValidation {
  const maxLength = options.maxLength ?? 800;
  const answer = typeof raw === 'string' ? raw.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim() : '';
  if (!answer) return { valid: false, answer: '', reason: 'Respons kosong.' };
  if (answer.length > maxLength) return { valid: false, answer: answer.slice(0, maxLength), reason: 'Respons terlalu panjang.' };
  if (SYSTEM_LEAK.test(answer)) return { valid: false, answer, reason: 'Respons membocorkan instruksi internal.' };
  if (UNSAFE_SECRET.test(answer)) return { valid: false, answer, reason: 'Respons menyebut data sensitif.' };
  if (options.businessKnowledgePresent === false && /\b(rp|harga\w*|stok\w*|tersedia|garansi\w*|besok|pasti)\b/i.test(answer)) {
    return { valid: false, answer, reason: 'Respons bisnis tidak didukung knowledge base.' };
  }
  return { valid: true, answer };
}
