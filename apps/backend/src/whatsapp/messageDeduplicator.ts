import { env } from '../config/env';

export class MessageDeduplicator {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = env.AUTO_REPLY_DEDUPE_TTL_MS) {}

  claim(key: string): boolean {
    const now = Date.now();
    for (const [oldKey, expires] of this.seen) if (expires <= now) this.seen.delete(oldKey);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + this.ttlMs);
    return true;
  }
  has(key: string): boolean { return (this.seen.get(key) || 0) > Date.now(); }
  clear(key: string): void { this.seen.delete(key); }
}

export const messageDeduplicator = new MessageDeduplicator();
