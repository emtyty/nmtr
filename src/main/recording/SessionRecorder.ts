import fs from 'fs'
import type { HopStats, TraceConfig, RecordingMeta, RecordingRouteChange, RouteChangeEvent } from '../../shared/types'

/**
 * SessionRecorder — writes a live trace session to an NDJSON file.
 *
 * File format (.nmtr):
 *   Line 1: {"type":"meta", ...RecordingMeta}
 *   Line N: {"type":"frame","t":<ms since start>,"hops":[...HopStats]}
 */
export class SessionRecorder {
  private filePath: string
  private config: TraceConfig
  private stream: fs.WriteStream | null = null
  private startedAt = 0

  constructor(filePath: string, config: TraceConfig) {
    this.filePath = filePath
    this.config = config
  }

  start(): void {
    this.stream = fs.createWriteStream(this.filePath, { flags: 'w', encoding: 'utf8' })
    this.startedAt = Date.now()

    const meta: RecordingMeta = {
      type: 'meta',
      version: process.env['npm_package_version'] ?? '0.1.0',
      target: this.config.target,
      startedAt: this.startedAt,
      protocol: this.config.protocol,
      intervalMs: this.config.intervalMs
    }
    this.stream.write(JSON.stringify(meta) + '\n')
  }

  writeFrame(hops: HopStats[], elapsedMs: number): void {
    if (!this.stream) return
    const frame = { type: 'frame', t: elapsedMs, hops }
    this.stream.write(JSON.stringify(frame) + '\n')
  }

  writeRouteChange(event: RouteChangeEvent, elapsedMs: number): void {
    if (!this.stream) return
    const entry: RecordingRouteChange = {
      type: 'routechange',
      t: elapsedMs,
      hopIndex: event.hopIndex,
      oldIP: event.oldIP,
      newIP: event.newIP
    }
    this.stream.write(JSON.stringify(entry) + '\n')
  }

  stop(): string {
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
    return this.filePath
  }
}
