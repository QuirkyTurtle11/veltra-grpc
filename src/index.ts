/**
 * veltra-grpc — production-ready Yellowstone gRPC client for Solana, built on a gRPC-agnostic
 * resilience core.
 *
 * Most users want the Yellowstone client (`VeltraGrpc`). If you have a *different* gRPC
 * bidi-streaming service and just want the reconnect/backoff/keepalive/failover machinery, use
 * the core directly (`ResilientStream`) — see `./core`.
 */

/* ---- Yellowstone client (the main API) ---- */
export { VeltraGrpc } from './yellowstone/client.js'
export { GeyserStream } from './yellowstone/geyser-stream.js'
export { ConnectionPool } from './yellowstone/pool.js'
export type { PoolConfig } from './yellowstone/pool.js'
export { buildSubscribeRequest } from './yellowstone/subscription.js'
export type { SubscribeRequest } from './yellowstone/subscription.js'
export type {
  VeltraGrpcConfig,
  Commitment,
  SubscribeOptions,
  TransactionFilter,
  AccountFilter,
  SlotFilter,
  BlockFilter,
  TransactionUpdate,
  AccountUpdate,
  SlotUpdate,
  BlockUpdate,
  StreamEvents,
} from './yellowstone/types.js'

/* ---- Generic core (use with any gRPC bidi-streaming service) ---- */
export { ResilientStream } from './core/resilient-stream.js'
export type { ResilientStreamConfig } from './core/resilient-stream.js'
export { Connection, parseEndpoint } from './core/connection.js'
export type { GrpcConnectionConfig, ConnectionHandlers } from './core/connection.js'
export { Backoff } from './core/backoff.js'
export { Keepalive } from './core/keepalive.js'
export type { ReconnectOptions, Logger, CoreEvents } from './core/types.js'
