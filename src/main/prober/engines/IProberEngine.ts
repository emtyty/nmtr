import type { ProbeOptions, ProbeResult } from '../../../shared/types'

export interface IProberEngine {
  /**
   * Send one probe to `target` with the given `ttl`.
   * Resolves with ProbeResult on ICMP TTL-exceeded or echo-reply.
   * Rejects with Error('timeout') after opts.timeoutMs.
   */
  probe(target: string, ttl: number, opts: ProbeOptions): Promise<ProbeResult>

  /** Clean up any open socket handles. */
  destroy(): void
}
