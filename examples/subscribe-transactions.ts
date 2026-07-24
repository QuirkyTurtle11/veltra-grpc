/**
 * Stream transactions that touch a given account (e.g. a program or wallet).
 *
 *   GRPC_ENDPOINT=https://your-endpoint:443 GRPC_X_TOKEN=your-token \
 *     npx tsx examples/subscribe-transactions.ts <account-address>
 */

import { VeltraGrpc } from '../src/index.js'

const endpoint = process.env.GRPC_ENDPOINT
const token = process.env.GRPC_X_TOKEN
const account = process.argv[2] ?? 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' // SPL Token program

if (!endpoint) {
  console.error('Set GRPC_ENDPOINT (and GRPC_X_TOKEN if your endpoint needs one).')
  process.exit(1)
}

const client = new VeltraGrpc({ endpoint, token })
const stream = client.subscribe({
  transactions: { accountInclude: [account], vote: false, failed: false },
  commitment: 'confirmed',
})

console.log(`watching transactions touching ${account}`)
stream.on('connect', () => console.log('connected'))
stream.on('transaction', (tx) => console.log(`${tx.signature}  slot ${tx.slot}`))
stream.on('error', (e) => console.error('error:', e.message))

process.on('SIGINT', async () => {
  await stream.close()
  process.exit(0)
})
