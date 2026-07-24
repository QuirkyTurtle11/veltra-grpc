/**
 * A single, generic gRPC bidirectional-streaming connection. You give it a proto file, a
 * service path, and a streaming method; it opens an authenticated duplex stream and surfaces
 * its raw data/error/end lifecycle. It has no idea what Yellowstone is — the adapter supplies
 * the proto and service details.
 */

import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'

export interface GrpcConnectionConfig {
  /** Absolute path to the .proto file. */
  protoPath: string
  /** Extra include dirs for proto imports. Defaults to the proto file's directory. */
  includeDirs?: string[]
  /** Dotted path to the service, e.g. "geyser.Geyser". */
  service: string
  /** Name of the bidi-streaming method on the service, e.g. "Subscribe". */
  method: string
  /** Metadata sent on connect, e.g. { "x-token": "..." }. */
  authMetadata?: Record<string, string>
  /** gRPC channel options (keepalive, message size, ...). Merged over sane defaults. */
  channelOptions?: Record<string, number>
  /** Force SSL/insecure; by default inferred from the endpoint scheme. */
  secure?: boolean
}

export interface ConnectionHandlers {
  onData(update: Record<string, unknown>): void
  onError(error: Error): void
  onEnd(): void
}

const DEFAULT_CHANNEL_OPTIONS: Record<string, number> = {
  'grpc.keepalive_time_ms': 30000,
  'grpc.keepalive_timeout_ms': 10000,
  'grpc.keepalive_permit_without_calls': 1,
  'grpc.http2.min_time_between_pings_ms': 15000,
  'grpc.http2.max_pings_without_data': 0,
  'grpc.initial_reconnect_backoff_ms': 1000,
  'grpc.max_reconnect_backoff_ms': 30000,
}

type StreamingMethod = (metadata: grpc.Metadata) => grpc.ClientDuplexStream<unknown, unknown>
type ClientCtor = new (
  address: string,
  creds: grpc.ChannelCredentials,
  options?: Record<string, unknown>
) => grpc.Client

// Cache the resolved client constructor per (protoPath + service) so we load/parse once.
const ctorCache = new Map<string, ClientCtor>()

function resolveCtor(config: GrpcConnectionConfig): ClientCtor {
  const cacheKey = `${config.protoPath}::${config.service}`
  const cached = ctorCache.get(cacheKey)
  if (cached) return cached

  const includeDirs = config.includeDirs ?? [dirOf(config.protoPath)]
  const pkgDef = protoLoader.loadSync(config.protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    bytes: Buffer,
    includeDirs,
  })
  const root = grpc.loadPackageDefinition(pkgDef) as unknown as Record<string, unknown>

  // Walk the dotted service path (e.g. "geyser.Geyser").
  let node: unknown = root
  for (const part of config.service.split('.')) {
    node = (node as Record<string, unknown>)?.[part]
  }
  if (typeof node !== 'function') {
    throw new Error(`Service "${config.service}" not found in ${config.protoPath}`)
  }
  const ctor = node as ClientCtor
  ctorCache.set(cacheKey, ctor)
  return ctor
}

export class Connection {
  private client: grpc.Client | null = null
  private stream: grpc.ClientDuplexStream<unknown, unknown> | null = null

  constructor(
    private readonly endpoint: string,
    private readonly config: GrpcConnectionConfig,
    private readonly handlers: ConnectionHandlers
  ) {}

  open(): void {
    const Ctor = resolveCtor(this.config)
    const { address, secure } = parseEndpoint(this.endpoint, this.config.secure)
    const creds = secure ? grpc.credentials.createSsl() : grpc.credentials.createInsecure()
    const options = {
      'grpc.max_receive_message_length': 1024 * 1024 * 1024,
      ...DEFAULT_CHANNEL_OPTIONS,
      ...this.config.channelOptions,
    }

    this.client = new Ctor(address, creds, options)

    const metadata = new grpc.Metadata()
    for (const [key, value] of Object.entries(this.config.authMetadata ?? {})) {
      metadata.set(key, value)
    }

    const invoke = (this.client as unknown as Record<string, StreamingMethod>)[this.config.method]
    if (typeof invoke !== 'function') {
      throw new Error(`Method "${this.config.method}" not found on service "${this.config.service}"`)
    }
    this.stream = invoke.call(this.client, metadata)
    this.stream.on('data', (msg) => this.handlers.onData(msg as Record<string, unknown>))
    this.stream.on('error', (err) => this.handlers.onError(err as Error))
    this.stream.on('end', () => this.handlers.onEnd())
  }

  write(message: unknown): void {
    this.stream?.write(message)
  }

  close(): void {
    if (this.stream) {
      this.stream.removeAllListeners()
      try {
        this.stream.end()
        this.stream.cancel()
      } catch {
        /* already closing */
      }
      this.stream = null
    }
    if (this.client) {
      this.client.close()
      this.client = null
    }
  }
}

/** "https://host:443" | "host" | "http://host:10000" -> { address: "host:port", secure }. */
export function parseEndpoint(
  endpoint: string,
  forceSecure?: boolean
): { address: string; secure: boolean } {
  let secure = true
  let rest = endpoint.trim().replace(/\/+$/, '')
  if (rest.startsWith('https://')) {
    rest = rest.slice('https://'.length)
    secure = true
  } else if (rest.startsWith('http://')) {
    rest = rest.slice('http://'.length)
    secure = false
  }
  if (forceSecure !== undefined) secure = forceSecure
  const hasPort = /:\d+$/.test(rest)
  const address = hasPort ? rest : `${rest}:${secure ? 443 : 80}`
  return { address, secure }
}

function dirOf(filePath: string): string {
  const i = filePath.lastIndexOf('/')
  return i === -1 ? '.' : filePath.slice(0, i)
}
