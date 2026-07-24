/**
 * Application-level heartbeat: writes a caller-supplied ping message on an interval to keep an
 * idle stream (and any proxies in between) from being reaped. gRPC-agnostic — the ping message
 * shape is provided by the adapter (Yellowstone uses `{ ping: { id } }`).
 *
 * This is separate from the channel's TCP/HTTP2 keepalive: that detects a dead socket, this
 * keeps the application stream considered active when no data is flowing.
 */

export interface Writable {
  write(message: unknown): void
}

export class Keepalive {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly intervalMs: number,
    private readonly pingMessage: () => unknown
  ) {}

  start(stream: Writable): void {
    this.stop()
    if (this.intervalMs <= 0) return
    this.timer = setInterval(() => {
      try {
        stream.write(this.pingMessage())
      } catch {
        // The connection layer handles stream errors; a failed ping just no-ops here.
      }
    }, this.intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
