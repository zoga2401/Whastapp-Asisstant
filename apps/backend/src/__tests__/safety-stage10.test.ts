import assert from 'node:assert/strict';
import test from 'node:test';
import { SlidingWindowRateLimiter } from '../whatsapp/rateLimiter';
import { LoopGuard } from '../whatsapp/loopGuard';
import { MessageDeduplicator } from '../whatsapp/messageDeduplicator';
import { validateOutgoingReply } from '../safety/outgoingSafety';

test('Stage 10 rate windows enforce contact and global caps independently', () => {
  const contact = new SlidingWindowRateLimiter(1, 1000);
  const global = new SlidingWindowRateLimiter(2, 1000);
  assert.equal(contact.allow('6281', 1000), true);
  assert.equal(contact.allow('6281', 1500), false);
  assert.equal(contact.allow('6282', 1500), true);
  assert.equal(global.allow('global', 1000), true);
  assert.equal(global.allow('global', 1100), true);
  assert.equal(global.allow('global', 1200), false);
  assert.equal(global.allow('global', 2101), true);
});

test('Stage 10 loop guard can be cleared after an intentional state transition', () => {
  const guard = new LoopGuard(1000);
  assert.equal(guard.shouldBlock('contact'), false);
  assert.equal(guard.shouldBlock('contact'), true);
  guard.clear('contact');
  assert.equal(guard.shouldBlock('contact'), false);
});

test('Stage 10 duplicate claim remains fail-closed', () => {
  const dedupe = new MessageDeduplicator(60_000);
  assert.equal(dedupe.claim('message-1'), true);
  assert.equal(dedupe.claim('message-1'), false);
  assert.equal(dedupe.has('message-1'), true);
});

test('Stage 10 final recipient safety rejects groups and broadcast destinations', () => {
  assert.equal(validateOutgoingReply('6281@g.us', 'Halo').allowed, false);
  assert.equal(validateOutgoingReply('status@broadcast', 'Halo').allowed, false);
  assert.equal(validateOutgoingReply('6281@s.whatsapp.net', 'Halo').allowed, true);
});
