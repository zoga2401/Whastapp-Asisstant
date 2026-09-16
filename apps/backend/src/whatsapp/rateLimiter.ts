export class SlidingWindowRateLimiter {
  private readonly events = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs = 60_000) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.events.get(key) || []).filter((time) => time > now - this.windowMs);
    if (recent.length >= this.limit) { this.events.set(key, recent); return false; }
    recent.push(now);
    this.events.set(key, recent);
    return true;
  }
  reset(key?: string): void { if (key) this.events.delete(key); else this.events.clear(); }
}
