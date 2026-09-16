export class LoopGuard {
  private readonly recent = new Map<string, number>();
  constructor(private readonly windowMs = 10 * 60_000) {}
  shouldBlock(conversationId: string, now = Date.now()): boolean {
    const last = this.recent.get(conversationId);
    if (last && now - last < this.windowMs) return true;
    this.recent.set(conversationId, now);
    return false;
  }
  clear(conversationId: string): void { this.recent.delete(conversationId); }
}
