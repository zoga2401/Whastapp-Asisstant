import type { AIMode, ConversationContextPayload, ConversationStatus } from '../whatsapp/types';
import type { KnowledgeSearchResult } from '../knowledge/types';

export type AIRequestState = 'ok' | 'blocked' | 'paused' | 'unavailable' | 'error';

export interface AIRequestDecision {
  allowed: boolean;
  reason: string;
  mode: AIMode;
  status: ConversationStatus | 'UNKNOWN';
  isPaused: boolean;
  aiEnabled: boolean;
  shouldRespond?: boolean;
  needsClarification?: boolean;
  needsHandover?: boolean;
  shouldNotRespond?: boolean;
}

export type MessageIntent = 'BUSINESS' | 'PERSONAL' | 'UNKNOWN' | 'URGENT';

export interface RoutingDecision {
  intent: MessageIntent;
  confidence: number;
  shouldRespond: boolean;
  needsClarification: boolean;
  needsHandover: boolean;
  shouldNotRespond: boolean;
  reason: string;
}

export interface AIConversationBundle {
  conversationId: string;
  userMessage: string;
  rawContext: ConversationContextPayload;
  decision: AIRequestDecision;
  contactName: string;
  summary: string | null;
  memories: ConversationContextPayload['memories'];
  recentMessages: ConversationContextPayload['recentMessages'];
  knowledge?: KnowledgeSearchResult;
  routing?: RoutingDecision;
}

export interface AIHealthReport {
  ok: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  retries: number;
  temperature: number;
  status: 'ready' | 'unavailable' | 'error';
  message: string;
}

export interface AIProcessResult {
  success: boolean;
  allowed: boolean;
  status: AIRequestState;
  message: string;
  conversationId: string;
  mode: AIMode;
  provider: 'ollama';
  answer?: string;
  decision: AIRequestDecision;
  routing?: RoutingDecision;
  draftOnly?: boolean;
  health?: AIHealthReport;
  responseAction?: import('./decisionEngine').ResponseAction;
  validation?: import('./responseValidator').ResponseValidation;
}

export interface ParsedAIResponse {
  answer: string;
  source: 'json' | 'text';
  confidence: number;
}
