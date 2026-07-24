/** Generic, gRPC-agnostic types shared by the resilient core. */

export interface ReconnectOptions {
  /** Turn automatic reconnection off. Default true. */
  enabled?: boolean
  /** First retry delay in ms. Default 1000. */
  initialDelayMs?: number
  /** Cap on the delay in ms. Default 30000. */
  maxDelayMs?: number
  /** Multiplier applied to the delay each attempt. Default 2. */
  factor?: number
  /** Random 0..jitter fraction added to each delay to avoid thundering herds. Default 0.2. */
  jitter?: number
  /** Give up after this many consecutive failures (0 = never). Default 0. */
  maxAttempts?: number
}

export interface Logger {
  debug?(...args: unknown[]): void
  info?(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error?(...args: unknown[]): void
}

/** Lifecycle + raw-data events emitted by the generic ResilientStream. */
export interface CoreEvents {
  /** A decoded protobuf message from the server stream. */
  data: Record<string, unknown>
  /** Connected or reconnected; the recovery hook has just run. */
  connect: void
  /** A retry is scheduled. */
  reconnect: { attempt: number; delayMs: number }
  /** The connection dropped. */
  disconnect: { error?: Error }
  /** A non-fatal error. */
  error: Error
  /** Reconnection gave up (maxAttempts reached). */
  close: void
}
