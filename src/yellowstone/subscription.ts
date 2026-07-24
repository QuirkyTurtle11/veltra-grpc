/**
 * Builds the protobuf `SubscribeRequest` (snake_case, the on-wire shape) from the friendly
 * camelCase `SubscribeOptions`. Pure — no I/O — so the mapping is unit-tested directly.
 *
 * The stream re-sends this exact request after every reconnect (via the core's onOpen hook),
 * which is how the library recovers your subscription without you re-issuing it.
 */

import type {
  SubscribeOptions,
  TransactionFilter,
  AccountFilter,
  SlotFilter,
  BlockFilter,
  Commitment,
} from './types.js'

const COMMITMENT: Record<Commitment, string> = {
  processed: 'PROCESSED',
  confirmed: 'CONFIRMED',
  finalized: 'FINALIZED',
}

/** The wire request. Field names are snake_case to match the proto (loaded with keepCase). */
export interface SubscribeRequest {
  accounts: Record<string, unknown>
  slots: Record<string, unknown>
  transactions: Record<string, unknown>
  transactions_status: Record<string, unknown>
  blocks: Record<string, unknown>
  blocks_meta: Record<string, unknown>
  entry: Record<string, unknown>
  commitment?: string
  accounts_data_slice: unknown[]
}

const DEFAULT_KEY = 'default'

export function buildSubscribeRequest(options: SubscribeOptions): SubscribeRequest {
  const req: SubscribeRequest = {
    accounts: {},
    slots: {},
    transactions: {},
    transactions_status: {},
    blocks: {},
    blocks_meta: {},
    entry: {},
    accounts_data_slice: [],
    commitment: COMMITMENT[options.commitment ?? 'confirmed'],
  }

  if (options.transactions !== undefined) {
    req.transactions = mapNamed(options.transactions, TX_KEYS, mapTxFilter, () => ({
      vote: false,
      failed: false,
      account_include: [],
      account_exclude: [],
      account_required: [],
    }))
  }

  if (options.accounts !== undefined) {
    req.accounts = mapNamed(options.accounts, ACCT_KEYS, mapAccountFilter, () => ({}))
  }

  if (options.slots !== undefined) {
    req.slots = mapNamed(options.slots, SLOT_KEYS, mapSlotFilter, () => ({}))
  }

  if (options.blocks !== undefined) {
    req.blocks = mapNamed(options.blocks, BLOCK_KEYS, mapBlockFilter, () => ({}))
  }

  if (options.blocksMeta) {
    req.blocks_meta = { [DEFAULT_KEY]: {} }
  }

  return req
}

const TX_KEYS = ['vote', 'failed', 'signature', 'accountInclude', 'accountExclude', 'accountRequired']
const ACCT_KEYS = ['account', 'owner']
const SLOT_KEYS = ['filterByCommitment']
const BLOCK_KEYS = ['accountInclude', 'includeTransactions', 'includeAccounts', 'includeEntries']

function mapNamed<T>(
  value: boolean | T | Record<string, T>,
  knownKeys: string[],
  mapOne: (f: T) => unknown,
  emptyFilter: () => unknown
): Record<string, unknown> {
  if (value === true) return { [DEFAULT_KEY]: emptyFilter() }
  if (value === false || value === null || typeof value !== 'object') return {}

  const obj = value as Record<string, unknown>
  const looksLikeSingleFilter = Object.keys(obj).length === 0 || knownKeys.some((k) => k in obj)
  if (looksLikeSingleFilter) {
    return { [DEFAULT_KEY]: mapOne(value as T) }
  }
  const out: Record<string, unknown> = {}
  for (const [name, filter] of Object.entries(obj)) {
    out[name] = mapOne(filter as T)
  }
  return out
}

function mapTxFilter(f: TransactionFilter): unknown {
  return {
    vote: f.vote ?? false,
    failed: f.failed ?? false,
    ...(f.signature ? { signature: f.signature } : {}),
    account_include: f.accountInclude ?? [],
    account_exclude: f.accountExclude ?? [],
    account_required: f.accountRequired ?? [],
  }
}

function mapAccountFilter(f: AccountFilter): unknown {
  return {
    account: f.account ?? [],
    owner: f.owner ?? [],
    filters: [],
  }
}

function mapSlotFilter(f: SlotFilter): unknown {
  return f.filterByCommitment === undefined ? {} : { filter_by_commitment: f.filterByCommitment }
}

function mapBlockFilter(f: BlockFilter): unknown {
  return {
    account_include: f.accountInclude ?? [],
    include_transactions: f.includeTransactions ?? true,
    include_accounts: f.includeAccounts ?? false,
    include_entries: f.includeEntries ?? false,
  }
}
