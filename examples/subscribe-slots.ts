/**
 * Minimal example: stream slot updates.
 *
 *   GRPC_ENDPOINT=https://your-endpoint:443 GRPC_X_TOKEN=your-token \
 *     npx tsx examples/subscribe-slots.ts
 *
 * Slots flow continuously, so this is the quickest way to confirm a connection works.
 */

import { VeltraGrpc } from '../src/index.js'

const endpoint = process.env.GRPC_ENDPOINT
const token = process.env.GRPC_X_TOKEN
if (!endpoint) {
  console.error('Set GRPC_ENDPOINT (and GRPC_X_TOKEN if your endpoint needs one).')
  process.exit(1)
}

const client = new VeltraGrpc({ endpoint, token })
const stream = client.subscribe({ slots: true, commitment: 'confirmed' })

stream.on('connect', () => console.log('connected'))
stream.on('slot', (s) => console.log(`slot ${s.slot} (${s.status})`))
stream.on('reconnect', ({ attempt, delayMs }) =>
  console.log(`reconnecting (attempt ${attempt}) in ${delayMs}ms`)
)
stream.on('error', (e) => console.error('error:', e.message))

process.on('SIGINT', async () => {
  await stream.close()
  process.exit(0)
})
