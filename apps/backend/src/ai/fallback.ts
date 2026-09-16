import type { ResponseAction } from './decisionEngine';

export function fallbackResponse(action: ResponseAction, reason?: string): string {
  switch (action) {
    case 'ASK_CLARIFICATION':
      return 'Boleh jelaskan kebutuhan atau detailnya sedikit lagi?';
    case 'HANDOVER_ADMIN':
      return 'Baik, pesan ini saya teruskan ke admin untuk ditangani.';
    case 'WAIT':
      return 'Baik, mohon tunggu sebentar. Admin akan menindaklanjuti.';
    case 'IGNORE':
      return '';
    case 'AI_REPLY':
      return 'Maaf, saya belum bisa memastikan jawabannya. Saya teruskan ke admin.';
    default:
      return reason ? `Maaf, ${reason.toLowerCase()}` : 'Maaf, saya belum bisa membantu saat ini.';
  }
}
