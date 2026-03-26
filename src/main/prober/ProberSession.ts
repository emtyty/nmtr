import { EventEmitter } from 'events'
import type { BrowserWindow } from 'electron'
import { randomUUID as _randomUUID } from 'crypto'
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
  ProbeOptions,
  RouteChangeEvent
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
  // Per-hop smoothed RTT estimates (EMA) — used to set adaptive timeouts
  private rttEstimates: Map<number, number> = new Map()
  // Authoritative last-known IP per TTL — separate from StatsAggregator for O(1) change detection
  private hopIPs: Map<number, string> = new Map()
  private routeChangeLog: RouteChangeEvent[] = []

  constructor(id: string, config: TraceConfig, window: BrowserWindow) {
    super()
    this.id = id
    this.config = config
    this.window = window
  }

  async start(): Promise<{ engineMode: 'pingus' | 'native' }> {
    if (this.status === 'running') return { engineMode: EngineFactory.getMode() }

    const { engine, mode } = await EngineFactory.createSafe()
    this.engine = engine

    // NativeEngine needs one-time traceroute to discover hops
    if (mode === 'native') {
      const native = this.engine as NativeEngine
      const hops = await native.discoverHops(this.config.target, this.config.maxHops)
      for (const [ttl, ip] of hops) {
        this.ensureAggregator(ttl).setIP(ip)
        this.knownHops.add(ttl)
        this.hopIPs.set(ttl, ip)
        this.currentMaxTTL = Math.max(this.currentMaxTTL, ttl)
        this.emitHopNew(ttl, ip)
        this.triggerEnrichment(ttl, ip)
      }
    }

    this.status = 'running'
    this.startedAt = Date.now()
    this.scheduleLoop()
    this.scheduleElapsedUpdates()
    return { engineMode: mode }
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
    this.rttEstimates.clear()
    this.hopIPs.clear()
    this.routeChangeLog = []
    this.finalHopTTL = null
    this.startedAt = Date.now()
    this.window.webContents.send(IPC.SESSION_RESET, { sessionId: this.id })
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

    const defaultTimeout = Math.min(this.config.intervalMs - 50, 2000)
    const baseOpts: ProbeOptions = {
      protocol: this.config.protocol,
      port: this.config.port,
      packetSize: this.config.packetSize,
      timeoutMs: defaultTimeout,
      useIPv6: this.config.useIPv6
    }

    // Spread probe starts evenly over 1/3 of the interval to avoid ICMP bursting
    // at intermediate routers (e.g. 500ms / 3 / 30 hops ≈ 5ms stagger each)
    const staggerMs = Math.floor(this.config.intervalMs / 3 / this.currentMaxTTL)

    const probePromises: Promise<void>[] = []

    for (let ttl = 1; ttl <= this.currentMaxTTL; ttl++) {
      const delayMs = (ttl - 1) * staggerMs
      const hopOpts: ProbeOptions = { ...baseOpts, timeoutMs: this.getHopTimeout(ttl, defaultTimeout) }
      probePromises.push(this.probeHop(ttl, hopOpts, delayMs))
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

  private async probeHop(ttl: number, opts: ProbeOptions, delayMs: number): Promise<void> {
    if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs))

    const agg = this.ensureAggregator(ttl)

    try {
      const result = await this.engine!.probe(this.config.target, ttl, opts)

      this.updateRttEstimate(ttl, result.rttMs)
      agg.record(result.rttMs)

      // Discover new hop
      if (!this.knownHops.has(ttl) && result.fromIP) {
        this.knownHops.add(ttl)
        this.hopIPs.set(ttl, result.fromIP)
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
      } else if (result.fromIP && this.hopIPs.get(ttl) !== result.fromIP) {
        // IP changed on a known hop — BGP reroute, failover, or ECMP
        const oldIP = this.hopIPs.get(ttl)!
        this.hopIPs.set(ttl, result.fromIP)
        agg.setIP(result.fromIP)
        agg.setHostname(null) // clear stale hostname

        const event: RouteChangeEvent = {
          sessionId: this.id,
          hopIndex: ttl,
          oldIP,
          newIP: result.fromIP,
          timestamp: Date.now()
        }
        this.routeChangeLog.push(event)
        this.window.webContents.send(IPC.HOP_ROUTE_CHANGED, event)

        if (this.recorder) this.recorder.writeRouteChange(event, Date.now() - this.startedAt)

        this.triggerEnrichment(ttl, result.fromIP)
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

  /**
   * Returns a per-hop timeout based on the smoothed RTT estimate for that TTL.
   * Uses 3× observed RTT + 50ms buffer so fast/known hops resolve quickly
   * without blocking Promise.allSettled on the slowest hop.
   * Falls back to TTL-proportional fraction of defaultMs before any data exists.
   */
  private getHopTimeout(ttl: number, defaultMs: number): number {
    const est = this.rttEstimates.get(ttl)
    if (est !== undefined) {
      // 3× smoothed RTT + 50ms jitter buffer, minimum 50ms, capped at default
      return Math.min(Math.max(Math.ceil(est * 3 + 50), 50), defaultMs)
    }
    // No data yet: scale proportionally with TTL so near hops time out sooner
    const ratio = Math.max(ttl / this.config.maxHops, 0.25)
    return Math.max(100, Math.ceil(defaultMs * ratio))
  }

  /** Exponential moving average update of per-hop RTT estimate (α = 0.25). */
  private updateRttEstimate(ttl: number, rttMs: number): void {
    if (rttMs <= 0) return
    const prev = this.rttEstimates.get(ttl)
    this.rttEstimates.set(ttl, prev !== undefined ? prev * 0.75 + rttMs * 0.25 : rttMs)
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
  return _randomUUID()
}
