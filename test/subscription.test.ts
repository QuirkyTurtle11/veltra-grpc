import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSubscribeRequest } from '../src/yellowstone/subscription.js'

test('transactions: true becomes a default all-non-vote filter', () => {
  const req = buildSubscribeRequest({ transactions: true })
  assert.deepEqual(req.transactions.default, {
    vote: false,
    failed: false,
    account_include: [],
    account_exclude: [],
    account_required: [],
  })
  assert.equal(req.commitment, 'CONFIRMED')
})

test('a single transaction filter maps camelCase to snake_case under "default"', () => {
  const req = buildSubscribeRequest({
    transactions: { accountInclude: ['AaA'], failed: true },
  })
  const f = req.transactions.default as Record<string, unknown>
  assert.deepEqual(f.account_include, ['AaA'])
  assert.equal(f.failed, true)
  assert.equal(f.vote, false)
})

test('a map of named transaction filters is preserved by name', () => {
  const req = buildSubscribeRequest({
    transactions: { pumps: { accountInclude: ['P'] }, whales: { accountInclude: ['W'] } },
  })
  assert.ok('pumps' in req.transactions && 'whales' in req.transactions)
  assert.deepEqual((req.transactions.pumps as Record<string, unknown>).account_include, ['P'])
  assert.equal(req.transactions.default, undefined)
})

test('accounts filter maps account/owner', () => {
  const req = buildSubscribeRequest({ accounts: { owner: ['TokenkegQ...'] } })
  const f = req.accounts.default as Record<string, unknown>
  assert.deepEqual(f.owner, ['TokenkegQ...'])
  assert.deepEqual(f.account, [])
})

test('slots: true and blocksMeta: true produce default entries', () => {
  const req = buildSubscribeRequest({ slots: true, blocksMeta: true })
  assert.deepEqual(req.slots.default, {})
  assert.deepEqual(req.blocks_meta.default, {})
})

test('commitment is mapped to the proto enum name', () => {
  assert.equal(buildSubscribeRequest({ commitment: 'processed' }).commitment, 'PROCESSED')
  assert.equal(buildSubscribeRequest({ commitment: 'finalized' }).commitment, 'FINALIZED')
})

test('omitted streams stay empty', () => {
  const req = buildSubscribeRequest({ slots: true })
  assert.deepEqual(req.transactions, {})
  assert.deepEqual(req.accounts, {})
  assert.deepEqual(req.blocks, {})
})
