/**
 * GeyserStream — the Yellowstone adapter over the generic core (ResilientStream).
 *
 * It builds the SubscribeRequest, hands the core everything it needs to connect and recover
 * (proto, service, x-token auth, the ping message), and translates each raw SubscribeUpdate
 * into a typed event (base58 signatures/pubkeys, numeric slots). All the resilience —
 * reconnect, backoff, keepalive, failover — comes for free from the core.
 */

import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import bs58 from 'bs58'
import { ResilientStream } from '../core/resilient-stream.js'
import { buildSubscribeRequest } from './subscription.js'
import type { ReconnectOptions, Logger } from '../core/types.js'
import type {
  SubscribeOptions,
  StreamEvents,
  TransactionUpdate,
  AccountUpdate,
  SlotUpdate,
  BlockUpdate,
} from './types.js'

const GEYSER_PROTO = fileURLToPath(new URL('../../proto/geyser.proto', import.meta.url))

export interface GeyserStreamConfig {
  endpoints: string[]
  token?: string
  reconnect?: ReconnectOptions
  pingIntervalMs?: number
  logger?: Logger
}

export interface GeyserStream {
  on<E extends keyof StreamEvents>(event: E, listener: (payload: StreamEvents[E]) => void): this
  once<E extends keyof StreamEvents>(event: E, listener: (payload: StreamEvents[E]) => void): this
  off<E extends keyof StreamEvents>(event: E, listener: (payload: StreamEvents[E]) => void): this
  emit<E extends keyof StreamEvents>(event: E, payload?: StreamEvents[E]): boolean
}

export class GeyserStream extends EventEmitter {
  private readonly core: ResilientStream
  private pingId = 0

  constructor(config: GeyserStreamConfig, options: SubscribeOptions) {
    super()
    const request = buildSubscribeRequest(options)

    this.core = new ResilientStream({
      endpoints: config.endpoints,
      connection: {
        protoPath: GEYSER_PROTO,
        service: 'geyser.Geyser',
        method: 'Subscribe',
        authMetadata: config.token ? { 'x-token': config.token } : {},
      },
      onOpen: (send) => send(request),
      ping:
        config.pingIntervalMs === 0
          ? undefined
          : {
              message: () => ({ ping: { id: this.pingId++ } }),
              intervalMs: config.pingIntervalMs ?? 20000,
            },
      reconnect: config.reconnect,
      logger: config.logger,
    })

    this.core.on('data', (u) => this.route(u))
    this.core.on('connect', () => this.emit('connect'))
    this.core.on('reconnect', (p) => this.emit('reconnect', p))
    this.core.on('disconnect', (p) => this.emit('disconnect', p))
    this.core.on('error', (e) => this.emit('error', e))
    this.core.on('close', () => this.emit('close'))
  }

  start(): this {
    this.core.start()
    return this
  }

  close(): Promise<void> {
    return this.core.close()
  }

  private route(update: Record<string, unknown>): void {
    this.emit('data', update)
    const filters = (update.filters as string[]) ?? []

    if (update.transaction) {
      this.emit('transaction', toTransaction(update.transaction, filters))
    } else if (update.account) {
      this.emit('account', toAccount(update.account, filters))
    } else if (update.slot) {
      this.emit('slot', toSlot(update.slot, filters))
    } else if (update.block) {
      this.emit('block', toBlock(update.block, filters))
    } else if (update.block_meta) {
      this.emit('blockMeta', { raw: update.block_meta, filters })
    }
    // ping/pong updates are keepalive plumbing; they still surface via the raw 'data' event.
  }
}

function toBase58(bytes: unknown): string {
  if (bytes instanceof Uint8Array) return bs58.encode(bytes)
  if (typeof bytes === 'string') return bytes
  return ''
}

function num(v: unknown): number {
  return typeof v === 'string' ? Number(v) : ((v as number) ?? 0)
}

function toTransaction(t: unknown, filters: string[]): TransactionUpdate {
  const tx = t as { transaction?: Record<string, unknown>; slot?: unknown }
  const info = tx.transaction ?? {}
  return {
    signature: toBase58(info.signature),
    slot: num(tx.slot),
    isVote: Boolean(info.is_vote),
    filters,
    raw: t,
  }
}

function toAccount(a: unknown, filters: string[]): AccountUpdate {
  const acc = a as { account?: Record<string, unknown>; slot?: unknown; is_startup?: boolean }
  const info = acc.account ?? {}
  return {
    pubkey: toBase58(info.pubkey),
    owner: toBase58(info.owner),
    slot: num(acc.slot),
    lamports: num(info.lamports),
    executable: Boolean(info.executable),
    isStartup: Boolean(acc.is_startup),
    data: (info.data as Buffer) ?? Buffer.alloc(0),
    filters,
    raw: a,
  }
}

function toSlot(s: unknown, filters: string[]): SlotUpdate {
  const slot = s as { slot?: unknown; parent?: unknown; status?: string }
  return {
    slot: num(slot.slot),
    parent: slot.parent != null ? num(slot.parent) : undefined,
    status: slot.status ?? '',
    filters,
  }
}

function toBlock(b: unknown, filters: string[]): BlockUpdate {
  const block = b as { slot?: unknown; blockhash?: string }
  return {
    slot: num(block.slot),
    blockhash: block.blockhash ?? '',
    filters,
    raw: b,
  }
}
