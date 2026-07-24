/**
 * Yellowstone-specific public types. These are the clean, camelCase shapes developers work
 * with; the snake_case protobuf wire format is handled in subscription.ts.
 */

import type { ReconnectOptions, Logger } from '../core/types.js'

/** Solana commitment levels, in ascending finality. */
export type Commitment = 'processed' | 'confirmed' | 'finalized'

export interface VeltraGrpcConfig {
  /** Yellowstone gRPC endpoint, e.g. "https://your-endpoint:443". */
  endpoint?: string
  /** Multiple endpoints for failover; tried in order when a connection fails. */
  endpoints?: string[]
  /** The `x-token` auth token for the endpoint, if it requires one. */
  token?: string
  /** Reconnect/backoff tuning. */
  reconnect?: ReconnectOptions
  /** Heartbeat ping interval in ms (0 disables). Default 20000. */
  pingIntervalMs?: number
  /** Optional logger; defaults to no-op. Pass `console` to see internal events. */
  logger?: Logger
}

/** What to stream. Every field is optional; include only what you want. */
export interface SubscribeOptions {
  /**
   * Transaction stream. `true` is shorthand for "all non-vote transactions". Provide a filter
   * (or a map of named filters) to narrow by account or signature.
   */
  transactions?: boolean | TransactionFilter | Record<string, TransactionFilter>
  /** Account update stream, filtered by account address or owner program. */
  accounts?: AccountFilter | Record<string, AccountFilter>
  /** Slot updates. `true` streams all slots. */
  slots?: boolean | SlotFilter | Record<string, SlotFilter>
  /** Full block stream. */
  blocks?: BlockFilter | Record<string, BlockFilter>
  /** Lightweight block metadata (no transactions). `true` to enable. */
  blocksMeta?: boolean
  /** Commitment level for the subscription. Default "confirmed". */
  commitment?: Commitment
}

export interface TransactionFilter {
  vote?: boolean
  failed?: boolean
  signature?: string
  accountInclude?: string[]
  accountExclude?: string[]
  accountRequired?: string[]
}

export interface AccountFilter {
  account?: string[]
  owner?: string[]
}

export interface SlotFilter {
  filterByCommitment?: boolean
}

export interface BlockFilter {
  accountInclude?: string[]
  includeTransactions?: boolean
  includeAccounts?: boolean
  includeEntries?: boolean
}

/* ------------------------------------------------------------------ *
 * Event payloads — what your handlers receive.
 * ------------------------------------------------------------------ */

export interface TransactionUpdate {
  /** Base58 transaction signature. */
  signature: string
  slot: number
  isVote: boolean
  /** The filter names this update matched (from your SubscribeOptions keys). */
  filters: string[]
  /** The raw decoded protobuf message, for fields not surfaced above. */
  raw: unknown
}

export interface AccountUpdate {
  /** Base58 account address. */
  pubkey: string
  /** Base58 owner program address. */
  owner: string
  slot: number
  lamports: number
  executable: boolean
  isStartup: boolean
  data: Buffer
  filters: string[]
  raw: unknown
}

export interface SlotUpdate {
  slot: number
  parent?: number
  status: string
  filters: string[]
}

export interface BlockUpdate {
  slot: number
  blockhash: string
  filters: string[]
  raw: unknown
}

/** Every event the Yellowstone stream can emit, mapped to its payload type. */
export interface StreamEvents {
  transaction: TransactionUpdate
  account: AccountUpdate
  slot: SlotUpdate
  block: BlockUpdate
  blockMeta: { raw: unknown; filters: string[] }
  data: unknown
  connect: void
  reconnect: { attempt: number; delayMs: number }
  disconnect: { error?: Error }
  error: Error
  close: void
}
