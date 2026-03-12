import { spawn } from 'child_process'
import type { IProberEngine } from './IProberEngine'
import type { ProbeOptions, ProbeResult } from '../../../shared/types'

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
    return new Promise((resolve, reject) => {
      // ping.exe -i <TTL> -n 1 -w <timeout> <target>
      const args = ['-i', String(ttl), '-n', '1', '-w', String(opts.timeoutMs), target]
      const child = spawn('ping', args, { windowsHide: true })

      let output = ''
      child.stdout.on('data', (d: Buffer) => (output += d.toString()))
      child.stderr.on('data', (d: Buffer) => (output += d.toString()))

      child.on('close', () => {
        // Match RTT from: "Reply from 1.2.3.4: bytes=32 time=5ms TTL=57"
        // Or TTL-exceeded: "Reply from 1.2.3.4: TTL expired in transit."
        const replyMatch = output.match(/Reply from ([\d.]+):.*?time[=<](\d+)ms/i)
        const ttlExpiredMatch = output.match(/Reply from ([\d.]+):.*TTL expired/i)
        const timeoutMatch = output.match(/Request timed out|100% loss/i)

        if (replyMatch) {
          const fromIP = replyMatch[1]
          const rttMs = parseInt(replyMatch[2], 10)
          // If fromIP === target → final hop, else intermediate
          const isFinalHop = fromIP === target
          resolve({ fromIP, rttMs, isFinalHop, hopIndex: ttl })
        } else if (ttlExpiredMatch) {
          const fromIP = ttlExpiredMatch[1]
          // Use cached hop IP if available, otherwise use what ping reports
          resolve({
            fromIP: this.hopCache.get(ttl) ?? fromIP,
            rttMs: 0, // TTL-expired doesn't give reliable RTT
            isFinalHop: false,
            hopIndex: ttl
          })
        } else if (timeoutMatch) {
          const err = new Error('timeout')
          ;(err as any).code = 'TIMEOUT'
          reject(err)
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
    // No persistent handles
  }
}
