import type { ConversationContextPayload } from '../whatsapp/types';
import { buildConversationContext } from '../whatsapp/contextBuilder';
import type { AIConversationBundle, AIRequestDecision } from './types';
import { normalizeUserMessageForPrompt } from './prompt';
import { searchKnowledge } from '../knowledge';
import { classifyIntent, evaluateRoutingDecision } from './router';

export function evaluateAIRequestDecision(context: ConversationContextPayload): AIRequestDecision {
  const mode = context.state.aiMode ?? 'OFF';
  const isPaused = Boolean(context.state.isAIPaused || context.state.status === 'AI_PAUSED');

  if (mode === 'OFF') {
    return {
      allowed: false,
      reason: 'Mode AI OFF untuk kontak ini.',
      mode,
      status: context.state.status,
      isPaused,
      aiEnabled: false,
      shouldRespond: false,
      shouldNotRespond: true,
    };
  }

  if (isPaused) {
    return {
      allowed: false,
      reason: 'Percakapan sedang AI_PAUSED dan menunggu admin.',
      mode,
      status: context.state.status,
      isPaused: true,
      aiEnabled: true,
      shouldRespond: false,
      shouldNotRespond: true,
    };
  }

  if (context.state.status === 'ADMIN_HANDOVER' || context.state.lastSpeaker === 'ADMIN' || context.state.aiAllowed === false) {
    return {
      allowed: false,
      reason: 'Percakapan sedang ditangani admin atau AI tidak diizinkan.',
      mode,
      status: context.state.status,
      isPaused,
      aiEnabled: false,
      shouldNotRespond: true,
      needsHandover: true,
    };
  }

  return {
    allowed: true,
    reason: 'AI diizinkan untuk menjawab berdasarkan konteks percakapan.',
    mode,
    status: context.state.status,
    isPaused: false,
    aiEnabled: true,
    shouldRespond: true,
    shouldNotRespond: false,
  };
}

export async function buildAIConversationBundle(
  conversationId: string,
  userMessage: string
): Promise<AIConversationBundle> {
  const rawContext = await buildConversationContext(conversationId, { messageLimit: 20, memoryLimit: 10 });
  const decision = evaluateAIRequestDecision(rawContext);
  const routing = evaluateRoutingDecision(userMessage, rawContext);
  const currentIntent = routing.intent;
  const previousBusinessMessage = rawContext.recentMessages
    .slice()
    .reverse()
    .find((message) => message.role === 'user' && classifyIntent(message.content, rawContext) === 'BUSINESS');
  const knowledgeQuery = previousBusinessMessage && currentIntent === 'UNKNOWN'
    ? `${previousBusinessMessage.content} ${userMessage}`
    : userMessage;
  const knowledge = (currentIntent === 'BUSINESS' || Boolean(previousBusinessMessage && currentIntent === 'UNKNOWN'))
    ? await searchKnowledge(knowledgeQuery)
    : undefined;

  return {
    conversationId,
    userMessage: normalizeUserMessageForPrompt(userMessage),
    rawContext,
    decision,
    contactName: rawContext.contact.displayName,
    summary: rawContext.summary ?? null,
    memories: rawContext.memories,
    recentMessages: rawContext.recentMessages,
    knowledge,
    routing,
  };
}
