/**
 * VeltraGrpc — the Yellowstone entry point. Construct with an endpoint (or several, for
 * failover) and an optional token, then call `subscribe()` for a typed, self-healing stream.
 */

import { GeyserStream } from './geyser-stream.js'
import type { VeltraGrpcConfig, SubscribeOptions } from './types.js'

export class VeltraGrpc {
  private readonly endpoints: string[]

  constructor(private readonly config: VeltraGrpcConfig) {
    this.endpoints = config.endpoints ?? (config.endpoint ? [config.endpoint] : [])
    if (this.endpoints.length === 0) {
      throw new Error('VeltraGrpc: provide `endpoint` or `endpoints`')
    }
  }

  /**
   * Open a subscription. Returns immediately with a GeyserStream that connects in the
   * background and re-connects on its own; attach handlers before the first event arrives.
   */
  subscribe(options: SubscribeOptions): GeyserStream {
    const stream = new GeyserStream(
      {
        endpoints: this.endpoints,
        token: this.config.token,
        reconnect: this.config.reconnect,
        pingIntervalMs: this.config.pingIntervalMs,
        logger: this.config.logger,
      },
      options
    )
    return stream.start()
  }
}
