import type { AIConversationBundle } from './types';
import { decideResponse, type DecisionResult } from './decisionEngine';
import { fallbackResponse } from './fallback';
import { validateResponse, type ResponseValidation } from './responseValidator';

export interface GeneratedResponse {
  decision: DecisionResult;
  validation: ResponseValidation;
  answer: string;
}

export function generateResponse(
  bundle: AIConversationBundle,
  generatedAnswer?: string,
  options: { aiAvailable?: boolean } = {},
): GeneratedResponse {
  const decision = decideResponse({
    context: bundle.rawContext,
    routing: bundle.routing ?? {
      intent: 'UNKNOWN', confidence: 0, shouldRespond: false, needsClarification: true,
      needsHandover: false, shouldNotRespond: false, reason: 'Routing belum tersedia.',
    },
    knowledge: bundle.knowledge,
    aiAvailable: options.aiAvailable,
    responseReady: generatedAnswer === undefined ? undefined : true,
  });
  const validation = decision.action === 'AI_REPLY'
    ? validateResponse(generatedAnswer, { businessKnowledgePresent: decision.requiresKnowledge ? Boolean(bundle.knowledge) : undefined })
    : validateResponse(fallbackResponse(decision.action, decision.reason));
  const answer = validation.valid ? validation.answer : fallbackResponse(decision.action, validation.reason);
  return { decision, validation, answer };
}
