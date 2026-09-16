import type { ConversationContextPayload } from '../whatsapp/types';
import type { MessageIntent, RoutingDecision } from './types';

const urgentPattern = /\b(urgent|darurat|segera|secepatnya|kritis|penipuan|ditipu|akun.*dibobol|keamanan|bahaya|kecelakaan|komplain besar)\b/i;
const businessPattern = /\b(harga|order|pesan|beli|jual|produk|layanan|jasa|invoice|faktur|tagihan|cctv|supplier|vendor|pengiriman|kirim|pemasangan|proyek|meeting|rapat|customer|pelanggan)\b/i;
const personalPattern = /\b(keluarga|rumah|ulang tahun|libur|sehat|sakit|makan|jemput|sekolah|teman|rindu|kabar|saya lagi|aku lagi)\b/i;
const greetingOnlyPattern = /^(halo|hai|hi|pagi|siang|sore|malam|assalamualaikum|makasih|terima kasih)[!. ]*$/i;

export function classifyIntent(message: string, context?: ConversationContextPayload): MessageIntent {
  const text = String(message ?? '').trim();
  if (urgentPattern.test(text)) return 'URGENT';
  const businessHits = (text.match(businessPattern) || []).length;
  const personalHits = (text.match(personalPattern) || []).length;
  const followUp = /^(berapa|gimana|bagaimana|terus|kalau begitu|lanjut|oke|ok)[?!.\s]*$/i.test(text);
  const priorBusiness = context?.recentMessages?.slice(-6).some((entry) => businessPattern.test(entry.content));
  if (followUp && priorBusiness) return 'BUSINESS';
  if (businessHits > personalHits || context?.contact.category === 'BUSINESS' && businessHits > 0) return 'BUSINESS';
  if (personalHits > businessHits || context?.contact.category === 'PERSONAL' && personalHits > 0) return 'PERSONAL';
  return 'UNKNOWN';
}

export function evaluateRoutingDecision(message: string, context: ConversationContextPayload): RoutingDecision {
  const intent = classifyIntent(message, context);
  const isAdminTakeover = context.state.status === 'ADMIN_HANDOVER' || context.state.lastSpeaker === 'ADMIN';
  const isPaused = Boolean(context.state.isAIPaused || context.state.status === 'AI_PAUSED');
  const aiDisabled = context.state.aiMode === 'OFF' || context.state.aiAllowed === false;
  const shouldNotRespond = isAdminTakeover || isPaused || aiDisabled || intent === 'URGENT';
  const needsHandover = intent === 'URGENT' || isAdminTakeover;
  const needsClarification = intent === 'UNKNOWN' && !shouldNotRespond;
  const shouldRespond = !shouldNotRespond && !needsHandover;

  let reason = 'Pesan terklasifikasi dan dapat dibuatkan draft.';
  if (isAdminTakeover) reason = 'Admin sedang mengambil alih percakapan.';
  else if (isPaused) reason = 'AI sedang dijeda.';
  else if (aiDisabled) reason = 'Mode AI OFF.';
  else if (intent === 'URGENT') reason = 'Pesan mendesak perlu ditangani admin.';
  else if (needsClarification) reason = 'Maksud pesan belum cukup jelas.';

  return {
    intent,
    confidence: intent === 'UNKNOWN' ? 0.35 : intent === 'URGENT' ? 0.95 : 0.8,
    shouldRespond,
    needsClarification,
    needsHandover,
    shouldNotRespond,
    reason,
  };
}
