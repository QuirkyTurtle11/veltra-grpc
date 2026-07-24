# veltra-grpc

A production-ready [Yellowstone gRPC](https://github.com/rpcpool/yellowstone-grpc) client for
Solana. Stream accounts, transactions, slots, and blocks over a **typed, self-healing**
connection — automatic reconnect, subscription recovery, heartbeats, backoff, pooling, and
failover — without ever touching protobuf or grpc-js internals.

```ts
import { VeltraGrpc } from 'veltra-grpc'

const client = new VeltraGrpc({ endpoint: 'https://your-endpoint:443', token: 'x-token' })

const stream = client.subscribe({
  transactions: { accountInclude: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] },
})

stream.on('transaction', (tx) => console.log(tx.signature, 'in slot', tx.slot))
```

## Why

The raw Yellowstone stream is a bare gRPC duplex: you decode protobuf yourself, and any
network blip silently drops your subscription. Every serious consumer re-implements the same
plumbing — reconnect loops, ping heartbeats, re-sending the subscribe request, decoding
`bytes` fields to base58. `veltra-grpc` is that plumbing, done once and done right.

## Install

```bash
npm install veltra-grpc
```

Requires Node.js 18+.

## Features

- **Typed events** — `transaction`, `account`, `slot`, `block` with decoded base58
  signatures/pubkeys and numeric slots. No protobuf in your code.
- **Automatic reconnect** with exponential backoff + jitter.
- **Subscription recovery** — your subscribe request is re-sent on every reconnect, so the
  stream resumes itself.
- **Heartbeats** — application-level pings keep the stream alive through idle periods, on top
  of tuned TCP/HTTP2 keepalive.
- **Failover** — pass multiple endpoints; the client rotates to the next on failure.
- **Connection pooling** — spread many subscriptions across several channels.
- **Authentication** — `x-token` handled for you.

## Quick start

```ts
import { VeltraGrpc } from 'veltra-grpc'

const client = new VeltraGrpc({
  endpoint: process.env.GRPC_ENDPOINT!,
  token: process.env.GRPC_X_TOKEN,
})

const stream = client.subscribe({ slots: true, commitment: 'confirmed' })

stream.on('connect', () => console.log('connected'))
stream.on('slot', (s) => console.log('slot', s.slot, s.status))
stream.on('reconnect', ({ attempt, delayMs }) =>
  console.log(`reconnecting (attempt ${attempt}) in ${delayMs}ms`)
)
stream.on('error', (e) => console.error(e.message))

// later
await stream.close()
```

Runnable versions are in [`examples/`](./examples):

```bash
GRPC_ENDPOINT=https://your-endpoint:443 GRPC_X_TOKEN=your-token \
  npx tsx examples/subscribe-slots.ts
```

## Subscribing

`subscribe(options)` accepts any combination of streams. Each accepts `true` (a sensible
default), a single filter, or a `{ name: filter }` map (the names come back on each update's
`filters` array).

```ts
client.subscribe({
  // transactions touching an account
  transactions: { accountInclude: ['<address>'], vote: false, failed: false },
  // accounts owned by a program
  accounts: { owner: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] },
  // all slots
  slots: true,
  // block metadata
  blocksMeta: true,
  commitment: 'confirmed', // 'processed' | 'confirmed' | 'finalized'
})
```

Named filters, so you can tell updates apart:

```ts
const stream = client.subscribe({
  transactions: {
    pumps: { accountInclude: ['<pumpfun program>'] },
    raydium: { accountInclude: ['<raydium program>'] },
  },
})
stream.on('transaction', (tx) => {
  if (tx.filters.includes('pumps')) handlePump(tx)
})
```

## Events

| Event | Payload | Fires when |
| --- | --- | --- |
| `transaction` | `TransactionUpdate` | a matching transaction lands |
| `account` | `AccountUpdate` | a matching account changes |
| `slot` | `SlotUpdate` | a slot update arrives |
| `block` / `blockMeta` | `BlockUpdate` / `{ raw, filters }` | block data arrives |
| `data` | raw `SubscribeUpdate` | every message (escape hatch) |
| `connect` | — | connected or reconnected |
| `reconnect` | `{ attempt, delayMs }` | a retry is scheduled |
| `disconnect` | `{ error? }` | the connection dropped |
| `error` | `Error` | a non-fatal error |
| `close` | — | reconnection gave up (see `reconnect.maxAttempts`) |

Byte fields are decoded for you (`tx.signature`, `account.pubkey`, `account.owner` are base58);
the untouched protobuf message is always on `.raw`.

## Configuration

```ts
new VeltraGrpc({
  endpoint: 'https://primary:443',
  endpoints: ['https://primary:443', 'https://backup:443'], // failover order
  token: 'x-token',
  pingIntervalMs: 20000,
  reconnect: {
    enabled: true,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    factor: 2,
    jitter: 0.2,
    maxAttempts: 0, // 0 = retry forever
  },
  logger: console, // optional; default is silent
})
```

## Connection pooling

For lots of independent subscriptions, spread them across several channels:

```ts
import { ConnectionPool } from 'veltra-grpc'

const pool = new ConnectionPool({ endpoint, token, size: 4 })
for (const wallet of wallets) {
  pool.subscribe({ transactions: { accountInclude: [wallet] } }).on('transaction', handle)
}
await pool.closeAll()
```

## Using the generic core with any gRPC service

The Yellowstone client is a thin adapter over a **gRPC-agnostic resilience core**,
`ResilientStream`. If you have a *different* gRPC bidi-streaming service and just want the
reconnect / backoff / keepalive / failover / subscription-recovery machinery, use the core
directly — you supply the proto, service, method, auth, and the request to (re)send on connect:

```ts
import { ResilientStream } from 'veltra-grpc'

const stream = new ResilientStream({
  endpoints: ['https://host:443'],
  connection: {
    protoPath: '/abs/path/to/your.proto',
    service: 'my.package.Service', // dotted path
    method: 'Subscribe', // a bidi-streaming method
    authMetadata: { authorization: 'Bearer ...' },
  },
  onOpen: (send) => send(myRequest), // re-sent on every reconnect
  ping: { message: () => ({ ping: {} }), intervalMs: 20000 },
}).start()

stream.on('data', (msg) => console.log(msg)) // raw decoded protobuf
stream.on('reconnect', ({ attempt, delayMs }) => {})
```

`ResilientStream` emits raw decoded messages on `data` plus the same lifecycle events; the
typing/decoding on top is the only Yellowstone-specific part. See
[`examples/resilient-core.ts`](./examples/resilient-core.ts).

## License

MIT
