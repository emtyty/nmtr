import type { IProberEngine } from './IProberEngine'
import type { ProbeOptions, ProbeResult } from '../../../shared/types'

/**
 * PingusEngine — RTT probe engine using Pingus's raw-socket ICMP implementation.
 *
 * Requires administrator privileges (raw socket).
 *
 * Pingus API:
 *   PingICMP.sendAsync(options) → always resolves, never rejects
 *   result.status:  'reply'     = ECHO_REPLY  (final hop)
 *                   'exception' = TIME_EXCEEDED (intermediate hop)
 *                   'timeout'   = no response
 *                   'error'     = raw socket / DNS failure
 *   result.reply.source: IP string of the responder (the hop)
 *   result.time:         RTT in milliseconds
 *
 * Serialization: probes are queued one at a time (concurrency=1) to prevent
 * multiple raw sockets from capturing each other's TIME_EXCEEDED replies.
 */
export class PingusEngine implements IProberEngine {
  private PingICMP: any
  private ready: Promise<void>
  // Serialize probes — concurrent raw sockets all see all ICMP packets and
  // can steal each other's TTL-exceeded replies, producing wrong hop data.
  private queue: Array<() => void> = []
  private running = false

  constructor() {
    this.ready = this.loadPingus()
  }

  async waitReady(): Promise<void> {
    await this.ready
  }

  private async loadPingus(): Promise<void> {
    // Use require() — more reliable than import() in packaged Electron (CJS) context
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pingus = require('pingus')
    this.PingICMP = pingus.PingICMP ?? pingus.default?.PingICMP
    if (!this.PingICMP) {
      throw new Error(`pingus.PingICMP not found — keys: ${Object.keys(pingus).join(', ')}`)
    }
    if (typeof this.PingICMP.sendAsync !== 'function') {
      throw new Error('pingus.PingICMP.sendAsync not found — unexpected Pingus version')
    }
    console.log('[PingusEngine] loaded, sendAsync ready')
  }

  /**
   * Serialized probe — queues the probe and waits for the previous one to finish.
   * This prevents concurrent raw sockets from stealing each other's ICMP replies.
   */
  async probe(target: string, ttl: number, opts: ProbeOptions): Promise<ProbeResult> {
    await this.ready
    return new Promise<ProbeResult>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.sendProbe(target, ttl, opts.timeoutMs ?? 2000)
          resolve(result)
        } catch (err) {
          reject(err)
        }
      })
      if (!this.running) this.drainQueue()
    })
  }

  private async drainQueue(): Promise<void> {
    this.running = true
    while (this.queue.length > 0) {
      const next = this.queue.shift()!
      await next()
    }
    this.running = false
  }

  private async sendProbe(target: string, ttl: number, timeoutMs: number): Promise<ProbeResult> {
    const result = await this.PingICMP.sendAsync({
      host: target,
      ttl,
      timeout: timeoutMs,
      bytes: 32
    })

    console.log(`[PingusEngine] ttl=${ttl} status=${result.status} time=${result.time} source=${result.reply?.source}`)

    if (result.status === 'timeout') {
      const err = new Error('timeout')
      ;(err as any).code = 'TIMEOUT'
      throw err
    }

    if (result.status === 'error') {
      const msg = String(result.error ?? 'error')
      const err = new Error(msg)
      ;(err as any).code = msg
      throw err
    }

    // 'reply' = ECHO_REPLY (destination reached), 'exception' = TIME_EXCEEDED (intermediate hop)
    const isFinalHop = result.status === 'reply'
    const fromIP: string =
      result.reply?.source ??
      result.ip?.label ??
      String(result.ip ?? target)

    return {
      fromIP,
      rttMs: typeof result.time === 'number' && result.time >= 0 ? result.time : 0,
      isFinalHop,
      hopIndex: ttl
    }
  }

  destroy(): void {
    this.queue.length = 0
  }
}
