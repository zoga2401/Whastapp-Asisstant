import assert from 'node:assert/strict';
import test from 'node:test';
import { SlidingWindowRateLimiter } from '../whatsapp/rateLimiter';
import { LoopGuard } from '../whatsapp/loopGuard';
import { MessageDeduplicator } from '../whatsapp/messageDeduplicator';
import { validateOutgoingReply } from '../safety/outgoingSafety';

test('Stage 9 deduplicates an incoming message id', () => {
  const dedupe = new MessageDeduplicator(60_000);
  assert.equal(dedupe.claim('wamid-1'), true);
  assert.equal(dedupe.claim('wamid-1'), false);
});

test('Stage 9 rate limiter and loop guard fail closed', () => {
  const limiter = new SlidingWindowRateLimiter(1, 1_000);
  assert.equal(limiter.allow('contact'), true);
  assert.equal(limiter.allow('contact'), false);
  const guard = new LoopGuard(1_000);
  assert.equal(guard.shouldBlock('conversation'), false);
  assert.equal(guard.shouldBlock('conversation'), true);
});

test('Stage 9 outgoing safety only permits individual safe text', () => {
  assert.equal(validateOutgoingReply('123@s.whatsapp.net', 'Halo').allowed, true);
  assert.equal(validateOutgoingReply('123@g.us', 'Halo').allowed, false);
  assert.equal(validateOutgoingReply('123@s.whatsapp.net', 'password Anda adalah x').allowed, false);
});
