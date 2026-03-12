import { EventEmitter } from 'events'
import type { BrowserWindow } from 'electron'
import { nanoid } from 'crypto'
import { EngineFactory } from './engines/EngineFactory'
import { StatsAggregator } from './StatsAggregator'
import { reverseDns } from './DnsResolver'
import { GeoIPLookup } from '../enrichment/GeoIPLookup'
import { SessionRecorder } from '../recording/SessionRecorder'
import { IPC } from '../ipc/channels'
import type {
  TraceConfig,
  SessionStatus,
  HopStats,
  ProbeOptions
} from '../../shared/types'
import type { IProberEngine } from './engines/IProberEngine'
import type { NativeEngine } from './engines/NativeEngine'

export class ProberSession extends EventEmitter {
  readonly id: string
  readonly config: TraceConfig

  private engine: IProberEngine | null = null
  private aggregators: Map<number, StatsAggregator> = new Map()
  private knownHops: Set<number> = new Set()
  private currentMaxTTL = 1
  private finalHopTTL: number | null = null
  private status: SessionStatus = 'idle'
  private timer: NodeJS.Timeout | null = null
  private startedAt = 0
  private elapsedInterval: NodeJS.Timeout | null = null
  private window: BrowserWindow
  private recorder: SessionRecorder | null = null

  constructor(id: string, config: TraceConfig, window: BrowserWindow) {
    super()
    this.id = id
    this.config = config
    this.window = window
  }

  async start(): Promise<void> {
    if (this.status === 'running') return

    this.engine = EngineFactory.create()

    // NativeEngine needs one-time traceroute to discover hops
    const mode = EngineFactory.getMode()
    if (mode === 'native') {
      const native = this.engine as NativeEngine
      const hops = await native.discoverHops(this.config.target, this.config.maxHops)
      for (const [ttl, ip] of hops) {
        this.ensureAggregator(ttl).setIP(ip)
        this.knownHops.add(ttl)
        this.currentMaxTTL = Math.max(this.currentMaxTTL, ttl)
        this.emitHopNew(ttl, ip)
        this.triggerEnrichment(ttl, ip)
      }
    }

    this.status = 'running'
    this.startedAt = Date.now()
    this.scheduleLoop()
    this.scheduleElapsedUpdates()
  }

  stop(): void {
    this.clearTimers()
    this.status = 'stopped'
    this.engine?.destroy()
    this.engine = null
    this.emitStatus()
    this.recorder?.stop()
  }

  reset(): void {
    for (const agg of this.aggregators.values()) {
      agg.reset()
    }
    this.finalHopTTL = null
    this.startedAt = Date.now()
    // Send zeroed snapshots in one batch
    this.window.webContents.send(IPC.HOPS_BATCH, {
      sessionId: this.id,
      hops: this.getAllSnapshots()
    })
    this.emitStatus()
  }

  startRecording(filePath: string): void {
    this.recorder = new SessionRecorder(filePath, this.config)
    this.recorder.start()
  }

  stopRecording(): string {
    if (!this.recorder) return ''
    const path = this.recorder.stop()
    this.recorder = null
    return path
  }

  private scheduleLoop(): void {
    this.timer = setInterval(() => this.runProbeRound(), this.config.intervalMs)
    // Run immediately on start
    this.runProbeRound()
  }

  private scheduleElapsedUpdates(): void {
    this.elapsedInterval = setInterval(() => this.emitStatus(), 1000)
  }

  private clearTimers(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    if (this.elapsedInterval) { clearInterval(this.elapsedInterval); this.elapsedInterval = null }
  }

  private async runProbeRound(): Promise<void> {
    if (!this.engine || this.status !== 'running') return

    const opts: ProbeOptions = {
      protocol: this.config.protocol,
      port: this.config.port,
      packetSize: this.config.packetSize,
      timeoutMs: Math.min(this.config.intervalMs - 50, 2000),
      useIPv6: this.config.useIPv6
    }

    const probePromises: Promise<void>[] = []

    for (let ttl = 1; ttl <= this.currentMaxTTL; ttl++) {
      probePromises.push(this.probeHop(ttl, opts))
    }

    // Expand TTL if we haven't found the final hop yet
    if (this.finalHopTTL === null && this.currentMaxTTL < this.config.maxHops) {
      this.currentMaxTTL++
    }

    await Promise.allSettled(probePromises)

    // Send all hop snapshots in ONE batch (N hops → 1 IPC call instead of N)
    const allSnapshots = this.getAllSnapshots()
    this.window.webContents.send(IPC.HOPS_BATCH, {
      sessionId: this.id,
      hops: allSnapshots
    })

    // Write recording frame
    if (this.recorder) {
      this.recorder.writeFrame(allSnapshots, Date.now() - this.startedAt)
    }
  }

  private async probeHop(ttl: number, opts: ProbeOptions): Promise<void> {
    const agg = this.ensureAggregator(ttl)

    try {
      const result = await this.engine!.probe(this.config.target, ttl, opts)

      agg.record(result.rttMs)

      // Discover new hop
      if (!this.knownHops.has(ttl) && result.fromIP) {
        this.knownHops.add(ttl)
        agg.setIP(result.fromIP)
        this.emitHopNew(ttl, result.fromIP)

        // Async DNS + enrichment
        if (this.config.resolveHostnames) {
          reverseDns(result.fromIP).then((hostname) => {
            if (hostname) {
              agg.setHostname(hostname)
              this.window.webContents.send(IPC.DNS_RESOLVED, {
                sessionId: this.id,
                hopIndex: ttl,
                hostname
              })
            }
          })
        }
        this.triggerEnrichment(ttl, result.fromIP)
      }

      if (result.isFinalHop && this.finalHopTTL === null) {
        this.finalHopTTL = ttl
        this.currentMaxTTL = ttl
      }
    } catch {
      // Timeout or no response — record loss
      agg.recordLoss()
    }
    // No per-hop IPC send here — runProbeRound sends HOPS_BATCH after all probes complete
  }

  private triggerEnrichment(ttl: number, ip: string): void {
    const agg = this.ensureAggregator(ttl)
    GeoIPLookup.lookup(ip).then((enrichment) => {
      if (enrichment) {
        agg.setEnrichment(enrichment)
        this.window.webContents.send(IPC.HOP_ENRICHED, {
          sessionId: this.id,
          hopIndex: ttl,
          enrichment
        })
      }
    })
  }

  private ensureAggregator(ttl: number): StatsAggregator {
    if (!this.aggregators.has(ttl)) {
      this.aggregators.set(ttl, new StatsAggregator(ttl))
    }
    return this.aggregators.get(ttl)!
  }

  private emitHopNew(ttl: number, ip: string): void {
    this.window.webContents.send(IPC.HOP_NEW, {
      sessionId: this.id,
      hopIndex: ttl,
      ip
    })
  }

  private emitStatus(): void {
    const totalSent = [...this.aggregators.values()].reduce((s, a) => s + a.snapshot().sent, 0)
    this.window.webContents.send(IPC.SESSION_STATUS, {
      sessionId: this.id,
      status: this.status,
      elapsedMs: this.status === 'running' ? Date.now() - this.startedAt : 0,
      totalSent
    })
  }

  getAllSnapshots(): HopStats[] {
    const snapshots: HopStats[] = []
    const maxTTL = this.currentMaxTTL
    for (let ttl = 1; ttl <= maxTTL; ttl++) {
      if (this.aggregators.has(ttl)) {
        snapshots.push(this.aggregators.get(ttl)!.snapshot())
      }
    }
    return snapshots
  }

  getStatus(): SessionStatus { return this.status }
  getStartedAt(): number { return this.startedAt }
}

export function makeSessionId(): string {
  return nanoid ? (nanoid as any)() : Math.random().toString(36).slice(2)
}
