import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEndpoint } from '../src/core/connection.js'

test('https endpoint is secure and keeps its port', () => {
  assert.deepEqual(parseEndpoint('https://host.example:443'), {
    address: 'host.example:443',
    secure: true,
  })
})

test('http endpoint is insecure', () => {
  assert.deepEqual(parseEndpoint('http://host.example:10000'), {
    address: 'host.example:10000',
    secure: false,
  })
})

test('a bare host defaults to secure :443', () => {
  assert.deepEqual(parseEndpoint('host.example'), { address: 'host.example:443', secure: true })
})

test('a bare host with a port keeps it and stays secure', () => {
  assert.deepEqual(parseEndpoint('host.example:900'), { address: 'host.example:900', secure: true })
})

test('trailing slashes are trimmed', () => {
  assert.equal(parseEndpoint('https://host.example:443/').address, 'host.example:443')
})

test('secure can be forced regardless of scheme', () => {
  assert.equal(parseEndpoint('http://host.example:443', true).secure, true)
})
