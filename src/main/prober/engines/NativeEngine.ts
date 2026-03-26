import { spawn } from 'child_process'
import type { IProberEngine } from './IProberEngine'
import type { ProbeOptions, ProbeResult } from '../../../shared/types'

// p-queue v8 is ESM-only; use CJS interop (same pattern as GeoIPLookup)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PQueueMod = require('p-queue')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PQueue: typeof import('p-queue').default = (PQueueMod as any).default ?? PQueueMod

/**
 * NativeEngine — fallback when process is not elevated.
 * Uses Windows built-in `ping.exe` with -i (TTL) flag for per-hop RTT.
 * ICMP only. UDP/TCP not supported in this mode.
 *
 * Initial hop discovery is handled by ProberSession calling discoverHops()
 * once before the main probe loop begins.
 */
export class NativeEngine implements IProberEngine {
  // Cache of discovered hop IPs by TTL (populated by discoverHops)
  private hopCache: Map<number, string> = new Map()
  // Cap concurrent ping.exe child processes to avoid spawning 30 at once
  private readonly probeQueue = new PQueue({ concurrency: 8 })

  /**
   * One-shot tracert discovery to pre-populate hopCache.
   * Called once by ProberSession before starting the probe loop.
   */
  async discoverHops(target: string, maxHops: number): Promise<Map<number, string>> {
    return new Promise((resolve) => {
      const hops = new Map<number, string>()
      const child = spawn('tracert', ['-d', '-h', String(maxHops), '-w', '1000', target], {
        windowsHide: true
      })

      let output = ''
      child.stdout.on('data', (d: Buffer) => (output += d.toString()))
      child.stderr.on('data', (d: Buffer) => (output += d.toString()))

      child.on('close', () => {
        // Parse tracert output lines like:
        //   1    <1 ms    <1 ms    <1 ms  192.168.1.1
        //   2     5 ms     5 ms     5 ms  10.0.0.1
        //   3     *        *        *     Request timed out.
        const lines = output.split('\n')
        for (const line of lines) {
          const m = line.match(/^\s*(\d+)\s+.*?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
          if (m) {
            hops.set(parseInt(m[1], 10), m[2])
          }
        }
        this.hopCache = hops
        resolve(hops)
      })
    })
  }

  async probe(target: string, ttl: number, opts: ProbeOptions): Promise<ProbeResult> {
    return this.probeQueue.add(() => this.spawnProbe(target, ttl, opts)) as Promise<ProbeResult>
  }

  private spawnProbe(target: string, ttl: number, opts: ProbeOptions): Promise<ProbeResult> {
    return new Promise((resolve, reject) => {
      // ping.exe -i <TTL> -n 1 -w <timeout> <target>
      const args = ['-i', String(ttl), '-n', '1', '-w', String(opts.timeoutMs), target]
      const child = spawn('ping', args, { windowsHide: true })

      let output = ''
      child.stdout.on('data', (d: Buffer) => (output += d.toString()))
      child.stderr.on('data', (d: Buffer) => (output += d.toString()))

      child.on('close', () => {
        // Locale-agnostic parsing — Windows ping output varies by system language.
        // Strategy:
        //   Echo reply   → line contains an IP address AND an RTT value (=Nms or <Nms)
        //   TTL-exceeded → line contains an IP address but NO RTT value
        //   Timeout      → no IP address found anywhere in the output
        //
        // We skip the first non-empty line ("Pinging X …") to avoid matching the target IP
        // as the reply source.
        const lines = output.split('\n')
        const headerIP = lines[0]?.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)?.[1]

        const IP_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/
        const RTT_RE = /[=<](\d+)\s*ms/i

        let replyIP: string | null = null
        let replyRtt: number | null = null
        let ttlExpiredIP: string | null = null

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]
          const ipM = line.match(IP_RE)
          if (!ipM) continue
          const ip = ipM[1]
          if (ip === headerIP) continue // skip header/stats lines that echo target IP

          const rttM = line.match(RTT_RE)
          if (rttM) {
            replyIP = ip
            replyRtt = parseInt(rttM[1], 10)
            break // echo reply — done
          } else if (!ttlExpiredIP) {
            ttlExpiredIP = ip // first IP-only line = TTL-exceeded
          }
        }

        if (replyIP !== null && replyRtt !== null) {
          // Successful echo reply → always the final destination
          resolve({ fromIP: replyIP, rttMs: replyRtt, isFinalHop: true, hopIndex: ttl })
        } else if (ttlExpiredIP !== null) {
          resolve({
            fromIP: this.hopCache.get(ttl) ?? ttlExpiredIP,
            rttMs: 0, // TTL-exceeded replies don't carry usable RTT
            isFinalHop: false,
            hopIndex: ttl
          })
        } else {
          const err = new Error('timeout')
          ;(err as any).code = 'TIMEOUT'
          reject(err)
        }
      })

      child.on('error', (err) => reject(err))
    })
  }

  destroy(): void {
    this.probeQueue.clear()
  }
}
