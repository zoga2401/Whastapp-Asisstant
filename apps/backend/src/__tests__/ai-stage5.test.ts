import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAIRequestDecision } from '../ai/context';
import { buildPromptFromContext } from '../ai/prompt';
import { parseAIResponse, summarizeAIError } from '../ai/response';
import type { ConversationContextPayload } from '../whatsapp/types';

const baseContext = (overrides: Partial<ConversationContextPayload> = {}): ConversationContextPayload => ({
  conversationId: 'conv-123',
  contact: {
    displayName: 'Sari',
    category: 'BUSINESS',
    aiMode: 'AUTO',
    notes: 'Pelanggan aktif',
  },
  state: {
    status: 'ACTIVE',
    aiMode: 'AUTO',
    lastSpeaker: 'USER',
    aiPausedUntil: null,
    isAIPaused: false,
    aiAllowed: true,
  },
  memories: [
    { id: 'm1', contact_id: 'c1', conversation_id: 'conv-123', type: 'PREFERENCE', key: 'Preferensi', value: 'Mau dikirim pagi', importance: 'HIGH', source: 'ADMIN', is_active: true, created_at: new Date(), updated_at: new Date() },
  ],
  summary: 'Diskusi sebelumnya mengenai pemasangan CCTV',
  recentMessages: [
    { role: 'user', content: 'Pak, berapa harga 4 kamera?', timestamp: new Date() },
    { role: 'assistant', content: 'Untuk 4 kamera kami mulai dari Rp1.5 juta.', timestamp: new Date() },
  ],
  ...overrides,
});

describe('AI Stage 5 prompt builder', () => {
  it('mempertahankan konteks campuran Indonesia-Jawa dan typo singkat', () => {
    const prompt = buildPromptFromContext({
      conversationId: 'conv-123',
      userMessage: 'Pak, ngendikno rega cctv 4 kamera?',
      rawContext: baseContext(),
      decision: evaluateAIRequestDecision(baseContext()),
      contactName: 'Sari',
      summary: 'Pelanggan ingin tahu harga CCTV',
      memories: baseContext().memories,
      recentMessages: baseContext().recentMessages,
    });

    assert.match(prompt, /ngendikno/);
    assert.match(prompt, /CCTV/);
    assert.match(prompt, /harga/);
  });

  it('menggabungkan ringkasan, memori, dan riwayat yang relevan', () => {
    const prompt = buildPromptFromContext({
      conversationId: 'conv-123',
      userMessage: 'Mau pasang paling cepat, kapan bisa? ',
      rawContext: baseContext(),
      decision: evaluateAIRequestDecision(baseContext()),
      contactName: 'Sari',
      summary: 'Belum dapat jadwal',
      memories: baseContext().memories,
      recentMessages: baseContext().recentMessages,
    });

    assert.match(prompt, /Belum dapat jadwal/);
    assert.match(prompt, /Preferensi/);
    assert.match(prompt, /Mau pasang paling cepat/);
  });
});

describe('AI Stage 5 response parser', () => {
  it('mem-parsing JSON answer yang valid', () => {
    const result = parseAIResponse('{"answer":"Halo, saya siap membantu."}');
    assert.equal(result.answer, 'Halo, saya siap membantu.');
    assert.equal(result.source, 'json');
  });

  it('mem-parsing text biasa dengan markdown fence', () => {
    const result = parseAIResponse('```\nHalo, mau tanya soal paket.\n```');
    assert.equal(result.answer, 'Halo, mau tanya soal paket.');
    assert.equal(result.source, 'text');
  });

  it('menangani error timeout sebagai deskripsi yang aman', () => {
    const message = summarizeAIError(new Error('FetchError: request to http://127.0.0.1:11434 timed out'));
    assert.match(message.toLowerCase(), /timeout|timed out/);
  });
});

describe('AI Stage 5 decision logic', () => {
  it('memblokir mode OFF', () => {
    const decision = evaluateAIRequestDecision(baseContext({ state: { ...baseContext().state, aiMode: 'OFF', aiAllowed: false } }));
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /OFF/i);
  });

  it('memblokir ketika AI_PAUSED', () => {
    const decision = evaluateAIRequestDecision(baseContext({ state: { ...baseContext().state, status: 'AI_PAUSED', isAIPaused: true, aiAllowed: false }, contact: { ...baseContext().contact, aiMode: 'AUTO' } }));
    assert.equal(decision.allowed, false);
    assert.equal(decision.isPaused, true);
  });

  it('mengizinkan AUTO dan HYBRID tetapi tidak men-generate pesan otomatis', () => {
    const autoDecision = evaluateAIRequestDecision(baseContext({ state: { ...baseContext().state, aiMode: 'AUTO', aiAllowed: true }, contact: { ...baseContext().contact, aiMode: 'AUTO' } }));
    const hybridDecision = evaluateAIRequestDecision(baseContext({ state: { ...baseContext().state, aiMode: 'HYBRID', aiAllowed: true }, contact: { ...baseContext().contact, aiMode: 'HYBRID' } }));

    assert.equal(autoDecision.allowed, true);
    assert.equal(hybridDecision.allowed, true);
    assert.equal(hybridDecision.mode, 'HYBRID');
  });
});
