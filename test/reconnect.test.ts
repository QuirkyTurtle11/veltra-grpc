import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Backoff } from '../src/core/backoff.js'

test('base delay grows exponentially and caps at maxDelay', () => {
  const b = new Backoff({ initialDelayMs: 1000, factor: 2, maxDelayMs: 30000 })
  assert.equal(b.baseDelayFor(0), 1000)
  assert.equal(b.baseDelayFor(1), 2000)
  assert.equal(b.baseDelayFor(2), 4000)
  assert.equal(b.baseDelayFor(3), 8000)
  assert.equal(b.baseDelayFor(10), 30000) // capped
})

test('nextDelay advances the attempt counter and never drops below base', () => {
  const b = new Backoff({ initialDelayMs: 1000, factor: 2, jitter: 0.5 })
  assert.equal(b.attempts, 0)
  const d0 = b.nextDelay()
  assert.ok(d0 >= 1000 && d0 <= 1500, `d0=${d0}`)
  assert.equal(b.attempts, 1)
  const d1 = b.nextDelay()
  assert.ok(d1 >= 2000 && d1 <= 3000, `d1=${d1}`)
  assert.equal(b.attempts, 2)
})

test('reset returns to the first delay', () => {
  const b = new Backoff({ initialDelayMs: 1000, factor: 2, jitter: 0 })
  b.nextDelay()
  b.nextDelay()
  assert.equal(b.attempts, 2)
  b.reset()
  assert.equal(b.attempts, 0)
  assert.equal(b.nextDelay(), 1000)
})

test('exhausted becomes true after maxAttempts, never when maxAttempts is 0', () => {
  const limited = new Backoff({ maxAttempts: 2 })
  assert.equal(limited.exhausted, false)
  limited.nextDelay()
  assert.equal(limited.exhausted, false)
  limited.nextDelay()
  assert.equal(limited.exhausted, true)

  const unlimited = new Backoff({ maxAttempts: 0 })
  for (let i = 0; i < 100; i++) unlimited.nextDelay()
  assert.equal(unlimited.exhausted, false)
})

test('enabled reflects the option', () => {
  assert.equal(new Backoff().enabled, true)
  assert.equal(new Backoff({ enabled: false }).enabled, false)
})
