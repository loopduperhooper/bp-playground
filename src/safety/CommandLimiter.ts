/** Enforces a maximum command frequency using an injected clock. */
export class CommandLimiter {
  private readonly minimumIntervalMs: number
  private lastSentAt?: number

  constructor(minimumIntervalMs: number) {
    this.minimumIntervalMs = minimumIntervalMs
  }

  canSend(now: number): boolean {
    if (this.lastSentAt === undefined) return true
    return now - this.lastSentAt >= this.minimumIntervalMs
  }

  recordSend(now: number): void {
    this.lastSentAt = now
  }

  reset(): void {
    this.lastSentAt = undefined
  }
}
