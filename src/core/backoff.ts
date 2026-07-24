/**
 * Exponential backoff with jitter. Pure (holds only the attempt counter), so the schedule is
 * easy to unit-test without touching a socket. gRPC-agnostic.
 *
 * delay(attempt) = min(maxDelay, initialDelay * factor^attempt) * (1 + random*jitter)
 */

import type { ReconnectOptions } from './types.js'

const DEFAULTS: Required<ReconnectOptions> = {
  enabled: true,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  jitter: 0.2,
  maxAttempts: 0,
}

export class Backoff {
  private readonly opts: Required<ReconnectOptions>
  private attempt = 0

  constructor(options: ReconnectOptions = {}) {
    this.opts = { ...DEFAULTS, ...options }
  }

  get enabled(): boolean {
    return this.opts.enabled
  }

  /** How many consecutive failures so far. */
  get attempts(): number {
    return this.attempt
  }

  /** True once we've exhausted maxAttempts (maxAttempts=0 means never give up). */
  get exhausted(): boolean {
    return this.opts.maxAttempts > 0 && this.attempt >= this.opts.maxAttempts
  }

  /** Reset after a successful connection. */
  reset(): void {
    this.attempt = 0
  }

  /**
   * Compute the delay for the NEXT attempt and advance the counter. The base (pre-jitter)
   * delay is deterministic; jitter adds up to `jitter` fraction on top.
   */
  nextDelay(): number {
    const base = Math.min(
      this.opts.maxDelayMs,
      this.opts.initialDelayMs * Math.pow(this.opts.factor, this.attempt)
    )
    this.attempt += 1
    const jitter = 1 + Math.random() * this.opts.jitter
    return Math.round(base * jitter)
  }

  /** The deterministic base delay for a given attempt, without jitter — used by tests. */
  baseDelayFor(attempt: number): number {
    return Math.min(
      this.opts.maxDelayMs,
      this.opts.initialDelayMs * Math.pow(this.opts.factor, attempt)
    )
  }
}
