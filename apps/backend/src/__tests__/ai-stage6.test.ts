import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyIntent, evaluateRoutingDecision } from '../ai/router';
import type { ConversationContextPayload } from '../whatsapp/types';

const context = (overrides: Partial<ConversationContextPayload> = {}): ConversationContextPayload => ({
  conversationId: 'c1',
  contact: { displayName: 'Test', category: 'UNKNOWN', aiMode: 'AUTO' },
  state: {
    status: 'ACTIVE', aiMode: 'AUTO', lastSpeaker: 'USER',
    aiPausedUntil: null, isAIPaused: false, aiAllowed: true,
  },
  memories: [], recentMessages: [], ...overrides,
});

describe('AI Stage 6 routing', () => {
  it('mengklasifikasikan intent bisnis, personal, unknown, dan urgent', () => {
    assert.equal(classifyIntent('Berapa harga pemasangan CCTV?', context()), 'BUSINESS');
    assert.equal(classifyIntent('Besok jemput anak sekolah', context()), 'PERSONAL');
    assert.equal(classifyIntent('Halo', context()), 'UNKNOWN');
    assert.equal(classifyIntent('Akun saya dibobol, segera bantu', context()), 'URGENT');
  });

  it('meminta handover untuk urgent dan tidak merespons saat admin takeover', () => {
    const urgent = evaluateRoutingDecision('Ini darurat, segera bantu', context());
    assert.equal(urgent.needsHandover, true);
    assert.equal(urgent.shouldNotRespond, true);
    const takeover = evaluateRoutingDecision('Tolong cek ini', context({
      state: { ...context().state, status: 'ADMIN_HANDOVER', lastSpeaker: 'ADMIN' },
    }));
    assert.equal(takeover.shouldNotRespond, true);
    assert.equal(takeover.shouldRespond, false);
  });

  it('menghormati AI OFF dan AI_PAUSED', () => {
    const off = evaluateRoutingDecision('Berapa harga?', context({
      state: { ...context().state, aiMode: 'OFF', aiAllowed: false },
    }));
    assert.equal(off.shouldNotRespond, true);
    const paused = evaluateRoutingDecision('Berapa harga?', context({
      state: { ...context().state, status: 'AI_PAUSED', isAIPaused: true },
    }));
    assert.equal(paused.shouldNotRespond, true);
  });
});
