/**
 * ConnectionPool — spread many Yellowstone subscriptions across several gRPC channels.
 *
 * One channel comfortably carries a single Subscribe stream; when you need lots of independent
 * subscriptions (one per tracked wallet, high-throughput fan-out), opening them all on one
 * channel concentrates load and a single point of failure. The pool holds `size` VeltraGrpc
 * clients and hands out subscriptions round-robin, with a single `closeAll()` for lifecycle.
 */

import { VeltraGrpc } from './client.js'
import type { GeyserStream } from './geyser-stream.js'
import type { VeltraGrpcConfig, SubscribeOptions } from './types.js'

export interface PoolConfig extends VeltraGrpcConfig {
  /** Number of underlying clients/channels to spread subscriptions across. Default 4. */
  size?: number
}

export class ConnectionPool {
  private readonly clients: VeltraGrpc[]
  private readonly streams: GeyserStream[] = []
  private next = 0

  constructor(config: PoolConfig) {
    const size = Math.max(1, config.size ?? 4)
    this.clients = Array.from({ length: size }, () => new VeltraGrpc(config))
  }

  /** Open a subscription on the next client in rotation. */
  subscribe(options: SubscribeOptions): GeyserStream {
    const client = this.clients[this.next % this.clients.length]
    this.next += 1
    const stream = client.subscribe(options)
    this.streams.push(stream)
    return stream
  }

  /** Close every subscription opened through this pool. */
  async closeAll(): Promise<void> {
    await Promise.all(this.streams.map((s) => s.close()))
    this.streams.length = 0
  }

  /** How many subscriptions are currently open. */
  get openCount(): number {
    return this.streams.length
  }
}
