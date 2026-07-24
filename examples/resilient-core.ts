/**
 * Using the gRPC-agnostic core directly.
 *
 * The Yellowstone client is built on `ResilientStream`, but you can point that core at ANY
 * gRPC bidi-streaming service to get the same reconnect / backoff / keepalive / failover /
 * subscription-recovery — you just supply the proto, service, method, auth, and the request to
 * (re)send on connect. This example uses the bundled Geyser proto to keep it runnable, but the
 * shape is identical for your own service.
 *
 *   GRPC_ENDPOINT=... GRPC_X_TOKEN=... npx tsx examples/resilient-core.ts
 */

import { fileURLToPath } from 'node:url'
import { ResilientStream } from '../src/index.js'

const protoPath = fileURLToPath(new URL('../proto/geyser.proto', import.meta.url))
const endpoint = process.env.GRPC_ENDPOINT
if (!endpoint) {
  console.error('Set GRPC_ENDPOINT (and GRPC_X_TOKEN if needed).')
  process.exit(1)
}

const stream = new ResilientStream({
  endpoints: [endpoint],
  connection: {
    protoPath,
    service: 'geyser.Geyser',
    method: 'Subscribe',
    authMetadata: process.env.GRPC_X_TOKEN ? { 'x-token': process.env.GRPC_X_TOKEN } : {},
  },
  // The raw request to (re)send on every connect — this is your subscription recovery.
  onOpen: (send) => send({ slots: { default: {} }, commitment: 'CONFIRMED' }),
  ping: { message: () => ({ ping: { id: 0 } }), intervalMs: 20000 },
}).start()

stream.on('connect', () => console.log('connected (core)'))
stream.on('data', (update) => {
  if (update.slot) console.log('raw slot update:', (update.slot as { slot: string }).slot)
})
stream.on('reconnect', ({ attempt, delayMs }) => console.log(`reconnecting #${attempt} in ${delayMs}ms`))

process.on('SIGINT', async () => {
  await stream.close()
  process.exit(0)
})
