import type { IProberEngine } from './IProberEngine'
import type { ProbeOptions, ProbeResult } from '../../../shared/types'

/**
 * PingusEngine — wraps the `pingus` npm library for ICMP / UDP / TCP probing
 * with TTL control. Used when the process has administrator privileges.
 *
 * Pingus API reference:
 *   import { PingICMP, PingUDP, PingTCP } from 'pingus'
 *   const p = new PingICMP({ host, ttl, timeout })
 *   const result = await p.send()
 *   // result: { alive: boolean, time: number, ttl: number, host: string, ... }
 */
export class PingusEngine implements IProberEngine {
  // Dynamically imported to avoid Vite bundling the native addon
  private PingICMP: any
  private PingUDP: any
  private PingTCP: any
  private ready: Promise<void>

  constructor() {
    this.ready = this.loadPingus()
  }

  private async loadPingus(): Promise<void> {
    try {
      const pingus = await import('pingus')
      this.PingICMP = pingus.PingICMP
      this.PingUDP = pingus.PingUDP
      this.PingTCP = pingus.PingTCP
    } catch (err) {
      throw new Error(`Failed to load pingus: ${err}. Ensure it is installed and electron-rebuild has run.`)
    }
  }

  async probe(target: string, ttl: number, opts: ProbeOptions): Promise<ProbeResult> {
    await this.ready

    const timeoutMs = opts.timeoutMs ?? 2000

    switch (opts.protocol) {
      case 'icmp':
        return this.probeICMP(target, ttl, timeoutMs)
      case 'udp':
        return this.probeUDP(target, ttl, opts.port ?? 33434 + ttl - 1, timeoutMs)
      case 'tcp':
        return this.probeTCP(target, ttl, opts.port ?? 80, timeoutMs)
      default:
        return this.probeICMP(target, ttl, timeoutMs)
    }
  }

  private async probeICMP(target: string, ttl: number, timeoutMs: number): Promise<ProbeResult> {
    const pinger = new this.PingICMP({
      host: target,
      ttl,
      timeout: timeoutMs
    })

    const result = await pinger.send()

    // result.alive = true  → echo reply (final hop)
    // result.alive = false → TTL-exceeded (intermediate hop) or timeout
    if (!result.host && !result.alive) {
      const err = new Error('timeout')
      ;(err as any).code = 'TIMEOUT'
      throw err
    }

    return {
      fromIP: result.host ?? result.ip ?? target,
      rttMs: result.time ?? 0,
      isFinalHop: result.alive === true,
      hopIndex: ttl
    }
  }

  private async probeUDP(
    target: string,
    ttl: number,
    port: number,
    timeoutMs: number
  ): Promise<ProbeResult> {
    const pinger = new this.PingUDP({
      host: target,
      ttl,
      port,
      timeout: timeoutMs
    })

    const result = await pinger.send()

    if (!result.host && !result.alive) {
      const err = new Error('timeout')
      ;(err as any).code = 'TIMEOUT'
      throw err
    }

    return {
      fromIP: result.host ?? target,
      rttMs: result.time ?? 0,
      isFinalHop: result.alive === true,
      hopIndex: ttl
    }
  }

  private async probeTCP(
    target: string,
    ttl: number,
    port: number,
    timeoutMs: number
  ): Promise<ProbeResult> {
    const pinger = new this.PingTCP({
      host: target,
      ttl,
      port,
      timeout: timeoutMs
    })

    const result = await pinger.send()

    if (!result.host && !result.alive) {
      const err = new Error('timeout')
      ;(err as any).code = 'TIMEOUT'
      throw err
    }

    return {
      fromIP: result.host ?? target,
      rttMs: result.time ?? 0,
      isFinalHop: result.alive === true,
      hopIndex: ttl
    }
  }

  destroy(): void {
    // pingus manages its own socket lifecycle per probe; no persistent handles to clean up
  }
}
