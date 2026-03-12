import type { HopStats, EnrichmentData } from '../../shared/types'

const SPARKLINE_SIZE = 60

/**
 * StatsAggregator — tracks per-hop statistics for one hop index.
 *
 * Maintains a 60-point circular ring buffer for sparkline rendering.
 * Jitter is computed using RFC 3550 mean absolute deviation:
 *   jitter += (|rtt_n - rtt_{n-1}| - jitter) / 16
 */
export class StatsAggregator {
  private hopIndex: number
  private ip: string | null = null
  private hostname: string | null = null
  private enrichment: EnrichmentData | null = null

  private sent = 0
  private recv = 0
  private lastRtt: number | null = null
  private bestRtt: number | null = null
  private worstRtt: number | null = null
  private sumRtt = 0
  private jitter: number | null = null
  private prevRtt: number | null = null

  // Circular ring buffer for sparkline (60 samples, newest added at end)
  private ring: (number | null)[] = new Array(SPARKLINE_SIZE).fill(null)
  private ringHead = 0 // points to the oldest slot (next write position)

  constructor(hopIndex: number) {
    this.hopIndex = hopIndex
  }

  setIP(ip: string): void {
    this.ip = ip
  }

  setHostname(hostname: string): void {
    this.hostname = hostname
  }

  setEnrichment(enrichment: EnrichmentData): void {
    this.enrichment = enrichment
  }

  record(rttMs: number): void {
    this.sent++
    this.recv++
    this.lastRtt = rttMs
    this.sumRtt += rttMs

    if (this.bestRtt === null || rttMs < this.bestRtt) this.bestRtt = rttMs
    if (this.worstRtt === null || rttMs > this.worstRtt) this.worstRtt = rttMs

    // RFC 3550 jitter
    if (this.prevRtt !== null) {
      const d = Math.abs(rttMs - this.prevRtt)
      if (this.jitter === null) {
        this.jitter = d
      } else {
        this.jitter += (d - this.jitter) / 16
      }
    }
    this.prevRtt = rttMs

    // Write to ring buffer
    this.ring[this.ringHead] = rttMs
    this.ringHead = (this.ringHead + 1) % SPARKLINE_SIZE
  }

  recordLoss(): void {
    this.sent++
    // Write null (gap) to ring buffer
    this.ring[this.ringHead] = null
    this.ringHead = (this.ringHead + 1) % SPARKLINE_SIZE
  }

  reset(): void {
    this.sent = 0
    this.recv = 0
    this.lastRtt = null
    this.bestRtt = null
    this.worstRtt = null
    this.sumRtt = 0
    this.jitter = null
    this.prevRtt = null
    this.ring = new Array(SPARKLINE_SIZE).fill(null)
    this.ringHead = 0
  }

  snapshot(): HopStats {
    // Build sparkline array ordered oldest→newest
    const sparkline: (number | null)[] = []
    for (let i = 0; i < SPARKLINE_SIZE; i++) {
      sparkline.push(this.ring[(this.ringHead + i) % SPARKLINE_SIZE])
    }

    const avg = this.recv > 0 ? Math.round((this.sumRtt / this.recv) * 10) / 10 : null
    const loss = this.sent > 0 ? ((this.sent - this.recv) / this.sent) * 100 : 0

    return {
      hopIndex: this.hopIndex,
      ip: this.ip,
      hostname: this.hostname,
      enrichment: this.enrichment,
      loss: Math.round(loss * 10) / 10,
      sent: this.sent,
      recv: this.recv,
      last: this.lastRtt !== null ? Math.round(this.lastRtt * 10) / 10 : null,
      avg,
      best: this.bestRtt !== null ? Math.round(this.bestRtt * 10) / 10 : null,
      worst: this.worstRtt !== null ? Math.round(this.worstRtt * 10) / 10 : null,
      jitter: this.jitter !== null ? Math.round(this.jitter * 10) / 10 : null,
      sparkline
    }
  }
}
