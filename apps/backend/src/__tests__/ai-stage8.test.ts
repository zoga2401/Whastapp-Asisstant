import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideResponse } from '../ai/decisionEngine';
import { fallbackResponse } from '../ai/fallback';
import { validateResponse } from '../ai/responseValidator';
import type { ConversationContextPayload } from '../whatsapp/types';
import type { RoutingDecision } from '../ai/types';

const context = (overrides: Partial<ConversationContextPayload['state']> = {}): ConversationContextPayload => ({
  conversationId: 'stage8',
  contact: { displayName: 'Pelanggan', category: 'BUSINESS', aiMode: 'AUTO' },
  state: { status: 'ACTIVE', aiMode: 'AUTO', lastSpeaker: 'USER', aiPausedUntil: null, isAIPaused: false, aiAllowed: true, ...overrides },
  memories: [], recentMessages: [],
});
const routing = (overrides: Partial<RoutingDecision> = {}): RoutingDecision => ({
  intent: 'PERSONAL', confidence: 0.9, shouldRespond: true, needsClarification: false,
  needsHandover: false, shouldNotRespond: false, reason: 'ok', ...overrides,
});

describe('Stage 8 decision engine', () => {
  it('prioritizes AI OFF, pause/admin, and urgent branches', () => {
    assert.equal(decideResponse({ context: context({ aiMode: 'OFF', aiAllowed: false }), routing: routing() }).action, 'IGNORE');
    assert.equal(decideResponse({ context: context({ status: 'AI_PAUSED', isAIPaused: true }), routing: routing() }).action, 'WAIT');
    assert.equal(decideResponse({ context: context(), routing: routing({ intent: 'URGENT', needsHandover: true }) }).action, 'HANDOVER_ADMIN');
  });
  it('requires business knowledge and allows personal AI replies', () => {
    assert.equal(decideResponse({ context: context(), routing: routing({ intent: 'BUSINESS' }) }).action, 'ASK_CLARIFICATION');
    assert.equal(decideResponse({ context: context(), routing: routing(), aiAvailable: true }).action, 'AI_REPLY');
  });
});

describe('Stage 8 response safety', () => {
  it('rejects empty, leaked, sensitive, and unsupported responses', () => {
    assert.equal(validateResponse('').valid, false);
    assert.equal(validateResponse('Ini system prompt rahasia').valid, false);
    assert.equal(validateResponse('Kode OTP Anda 1234').valid, false);
    assert.equal(validateResponse('Harganya Rp10.000', { businessKnowledgePresent: false }).valid, false);
  });
  it('returns short Indonesian fallbacks', () => {
    assert.match(fallbackResponse('ASK_CLARIFICATION'), /jelaskan/i);
    assert.equal(fallbackResponse('IGNORE'), '');
  });
});
