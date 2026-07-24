/**
 * ResilientStream — the gRPC-agnostic resilience engine.
 *
 * Wrap ANY gRPC bidirectional-streaming method in automatic reconnect (exponential backoff),
 * subscription recovery, heartbeats, and endpoint failover. It emits raw decoded messages on
 * `data` plus lifecycle events; a domain adapter (see ../yellowstone) layers typed events on
 * top.
 *
 *   const stream = new ResilientStream({
 *     endpoints: ['https://host:443'],
 *     connection: { protoPath, service: 'my.Service', method: 'Subscribe', authMetadata: {...} },
 *     onOpen: (send) => send(myRequest),           // re-sent on every reconnect
 *     ping: { message: () => ({ ping: {} }), intervalMs: 20000 },
 *   }).start()
 *   stream.on('data', (msg) => ...)
 */

import { EventEmitter } from 'node:events'
import { Connection, type GrpcConnectionConfig } from './connection.js'
import { Backoff } from './backoff.js'
import { Keepalive } from './keepalive.js'
import type { ReconnectOptions, Logger, CoreEvents } from './types.js'

export interface ResilientStreamConfig {
  /** One endpoint, or several to fail over between (rotated on each reconnect). */
  endpoints: string[]
  /** How to reach the gRPC service (proto, service, method, auth). */
  connection: GrpcConnectionConfig
  /**
   * Called on every (re)connect with a `send` function. Use it to (re)send your subscribe
   * request(s) — this is what recovers the subscription after a drop.
   */
  onOpen?: (send: (message: unknown) => void) => void
  /** Heartbeat ping. Omit to disable. */
  ping?: { message: () => unknown; intervalMs?: number }
  reconnect?: ReconnectOptions
  logger?: Logger
}

export interface ResilientStream {
  on<E extends keyof CoreEvents>(event: E, listener: (payload: CoreEvents[E]) => void): this
  once<E extends keyof CoreEvents>(event: E, listener: (payload: CoreEvents[E]) => void): this
  off<E extends keyof CoreEvents>(event: E, listener: (payload: CoreEvents[E]) => void): this
  emit<E extends keyof CoreEvents>(event: E, payload?: CoreEvents[E]): boolean
}

export class ResilientStream extends EventEmitter {
  private readonly backoff: Backoff
  private readonly keepalive: Keepalive | null
  private readonly log: Logger
  private connection: Connection | null = null
  private endpointIndex = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(private readonly config: ResilientStreamConfig) {
    super()
    this.backoff = new Backoff(config.reconnect)
    this.keepalive = config.ping
      ? new Keepalive(config.ping.intervalMs ?? 20000, config.ping.message)
      : null
    this.log = config.logger ?? {}
  }

  /** Begin connecting. Deferred a tick so callers can attach handlers first. */
  start(): this {
    setImmediate(() => this.connect())
    return this
  }

  /** Send a message on the current stream (e.g. an updated subscription). */
  write(message: unknown): void {
    this.connection?.write(message)
  }

  /** Stop for good: no more reconnects, tear everything down. */
  async close(): Promise<void> {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.keepalive?.stop()
    this.connection?.close()
    this.connection = null
  }

  private connect(): void {
    if (this.closed) return
    const endpoint = this.config.endpoints[this.endpointIndex % this.config.endpoints.length]

    this.connection = new Connection(endpoint, this.config.connection, {
      onData: (update) => this.emit('data', update),
      onError: (error) => this.handleDisconnect(error),
      onEnd: () => this.handleDisconnect(),
    })

    try {
      this.connection.open()
      this.config.onOpen?.((msg) => this.connection?.write(msg))
      if (this.keepalive && this.connection) this.keepalive.start(this.connection)
      this.backoff.reset()
      this.log.info?.('[resilient-grpc] connected', endpoint)
      this.emit('connect')
    } catch (error) {
      this.handleDisconnect(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleDisconnect(error?: Error): void {
    this.keepalive?.stop()
    this.connection?.close()
    this.connection = null
    if (this.closed) return

    this.emit('disconnect', error ? { error } : {})
    if (error) this.emit('error', error)

    if (!this.backoff.enabled || this.backoff.exhausted) {
      this.log.warn?.('[resilient-grpc] reconnection disabled or exhausted; closing')
      this.emit('close')
      this.closed = true
      return
    }

    // Failover: advance to the next endpoint for the retry.
    this.endpointIndex += 1
    const delayMs = this.backoff.nextDelay()
    this.emit('reconnect', { attempt: this.backoff.attempts, delayMs })
    this.log.warn?.(`[resilient-grpc] reconnecting in ${delayMs}ms (attempt ${this.backoff.attempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delayMs)
    this.reconnectTimer.unref?.()
  }
}
