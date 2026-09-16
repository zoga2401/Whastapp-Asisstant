import type { KnowledgeSearchResult } from '../knowledge/types';
import type { ConversationContextPayload } from '../whatsapp/types';
import type { RoutingDecision } from './types';

export type ResponseAction =
  | 'AI_REPLY'
  | 'ASK_CLARIFICATION'
  | 'HANDOVER_ADMIN'
  | 'IGNORE'
  | 'WAIT';

export interface DecisionInput {
  context: ConversationContextPayload;
  routing: RoutingDecision;
  knowledge?: KnowledgeSearchResult;
  aiAvailable?: boolean;
  responseReady?: boolean;
}

export interface DecisionResult {
  action: ResponseAction;
  reason: string;
  allowOllama: boolean;
  requiresKnowledge: boolean;
}

const hasKnowledge = (knowledge?: KnowledgeSearchResult): boolean => Boolean(knowledge && (
  knowledge.products.length || knowledge.variants.length || knowledge.services.length ||
  knowledge.prices.length || knowledge.areas.length || knowledge.warranties.length ||
  knowledge.faqs.length || knowledge.rules.length
));

export function decideResponse(input: DecisionInput): DecisionResult {
  const { context, routing } = input;
  const state = context.state;

  if (state.aiMode === 'OFF' || state.aiAllowed === false) {
    return { action: 'IGNORE', reason: 'Mode AI OFF atau AI tidak diizinkan.', allowOllama: false, requiresKnowledge: false };
  }
  if (state.status === 'ADMIN_HANDOVER' || state.lastSpeaker === 'ADMIN') {
    return { action: 'HANDOVER_ADMIN', reason: 'Admin sedang mengambil alih percakapan.', allowOllama: false, requiresKnowledge: false };
  }
  if (state.isAIPaused || state.status === 'AI_PAUSED') {
    return { action: 'WAIT', reason: 'Percakapan sedang dijeda untuk admin.', allowOllama: false, requiresKnowledge: false };
  }
  if (routing.intent === 'URGENT' || routing.needsHandover) {
    return { action: 'HANDOVER_ADMIN', reason: 'Pesan mendesak atau membutuhkan penanganan admin.', allowOllama: false, requiresKnowledge: false };
  }
  if (routing.intent === 'UNKNOWN' || routing.needsClarification) {
    return { action: 'ASK_CLARIFICATION', reason: 'Maksud pesan belum cukup jelas.', allowOllama: false, requiresKnowledge: false };
  }

  const requiresKnowledge = routing.intent === 'BUSINESS';
  if (requiresKnowledge && !hasKnowledge(input.knowledge)) {
    return { action: 'ASK_CLARIFICATION', reason: 'Fakta bisnis belum tersedia di knowledge base.', allowOllama: false, requiresKnowledge: true };
  }
  if (input.aiAvailable === false) {
    return { action: 'WAIT', reason: 'AI lokal belum tersedia.', allowOllama: false, requiresKnowledge };
  }
  if (input.responseReady === false) {
    return { action: 'WAIT', reason: 'Menunggu hasil AI lokal.', allowOllama: true, requiresKnowledge };
  }
  return { action: 'AI_REPLY', reason: 'AI diizinkan menjawab berdasarkan konteks dan knowledge.', allowOllama: true, requiresKnowledge };
}
