import { describe, it, expect } from 'vitest'

// ── RTT estimate logic (same as ProberSession.updateRttEstimate / getHopTimeout) ──

/** EMA update: α = 0.25 */
function updateRttEstimate(estimates: Map<number, number>, ttl: number, rttMs: number): void {
  if (rttMs <= 0) return
  const prev = estimates.get(ttl)
  estimates.set(ttl, prev !== undefined ? prev * 0.75 + rttMs * 0.25 : rttMs)
}

/** Adaptive timeout: 3× smoothed RTT + 50ms buffer, capped at defaultMs */
function getHopTimeout(estimates: Map<number, number>, ttl: number, defaultMs: number, maxHops: number): number {
  const est = estimates.get(ttl)
  if (est !== undefined) {
    return Math.min(Math.max(Math.ceil(est * 3 + 50), 50), defaultMs)
  }
  const ratio = Math.max(ttl / maxHops, 0.25)
  return Math.max(100, Math.ceil(defaultMs * ratio))
}

// ── Generation counter logic ──

interface GenerationTracker {
  generation: number
  results: string[]
}

function simulateAsyncCallback(tracker: GenerationTracker, capturedGen: number, value: string): void {
  if (capturedGen === tracker.generation) {
    tracker.results.push(value)
  }
}

// ── Route change detection logic ──

function detectRouteChange(
  hopIPs: Map<number, string>,
  ttl: number,
  newIP: string
): { changed: boolean; oldIP?: string } {
  const oldIP = hopIPs.get(ttl)
  if (oldIP && oldIP !== newIP) {
    hopIPs.set(ttl, newIP)
    return { changed: true, oldIP }
  }
  if (!oldIP) {
    hopIPs.set(ttl, newIP)
  }
  return { changed: false }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProberSession helpers', () => {
  describe('RTT estimate (EMA α=0.25)', () => {
    it('first sample sets estimate directly', () => {
      const estimates = new Map<number, number>()
      updateRttEstimate(estimates, 1, 100)
      expect(estimates.get(1)).toBe(100)
    })

    it('subsequent samples apply EMA smoothing', () => {
      const estimates = new Map<number, number>()
      updateRttEstimate(estimates, 1, 100)
      updateRttEstimate(estimates, 1, 200)
      // 100 * 0.75 + 200 * 0.25 = 125
      expect(estimates.get(1)).toBe(125)
    })

    it('converges toward repeated value', () => {
      const estimates = new Map<number, number>()
      updateRttEstimate(estimates, 1, 100)
      for (let i = 0; i < 20; i++) {
        updateRttEstimate(estimates, 1, 50)
      }
      // Should converge close to 50
      expect(estimates.get(1)!).toBeGreaterThan(49)
      expect(estimates.get(1)!).toBeLessThan(52)
    })

    it('ignores zero RTT', () => {
      const estimates = new Map<number, number>()
      updateRttEstimate(estimates, 1, 0)
      expect(estimates.has(1)).toBe(false)
    })

    it('ignores negative RTT', () => {
      const estimates = new Map<number, number>()
      updateRttEstimate(estimates, 1, -5)
      expect(estimates.has(1)).toBe(false)
    })

    it('tracks multiple TTLs independently', () => {
      const estimates = new Map<number, number>()
      updateRttEstimate(estimates, 1, 10)
      updateRttEstimate(estimates, 5, 50)
      updateRttEstimate(estimates, 10, 100)
      expect(estimates.get(1)).toBe(10)
      expect(estimates.get(5)).toBe(50)
      expect(estimates.get(10)).toBe(100)
    })
  })

  describe('adaptive hop timeout', () => {
    it('uses 3× RTT + 50ms when estimate exists', () => {
      const estimates = new Map<number, number>()
      estimates.set(1, 10) // 10ms RTT
      // 3 * 10 + 50 = 80ms
      expect(getHopTimeout(estimates, 1, 2000, 30)).toBe(80)
    })

    it('caps at defaultMs', () => {
      const estimates = new Map<number, number>()
      estimates.set(1, 1000) // 1000ms → 3*1000+50 = 3050 → capped to 2000
      expect(getHopTimeout(estimates, 1, 2000, 30)).toBe(2000)
    })

    it('minimum 50ms even for fast hops', () => {
      const estimates = new Map<number, number>()
      estimates.set(1, 0.1) // 0.1ms → 3*0.1+50 = 50.3 → ceil = 51
      expect(getHopTimeout(estimates, 1, 2000, 30)).toBeGreaterThanOrEqual(50)
    })

    it('scales proportionally with TTL when no estimate', () => {
      const estimates = new Map<number, number>()
      const t1 = getHopTimeout(estimates, 1, 2000, 30)
      const t15 = getHopTimeout(estimates, 15, 2000, 30)
      const t30 = getHopTimeout(estimates, 30, 2000, 30)
      // Higher TTL → higher timeout
      expect(t15).toBeGreaterThan(t1)
      expect(t30).toBeGreaterThan(t15)
    })

    it('enforces minimum 100ms for unknown hops', () => {
      const estimates = new Map<number, number>()
      const timeout = getHopTimeout(estimates, 1, 200, 30)
      expect(timeout).toBeGreaterThanOrEqual(100)
    })

    it('minimum ratio is 0.25 (not zero for TTL=0)', () => {
      const estimates = new Map<number, number>()
      // TTL 1, maxHops 30 → ratio = max(1/30, 0.25) = 0.25
      const timeout = getHopTimeout(estimates, 1, 2000, 30)
      expect(timeout).toBe(Math.max(100, Math.ceil(2000 * 0.25)))
    })
  })

  describe('generation counter (async cancellation)', () => {
    it('allows callbacks from current generation', () => {
      const tracker: GenerationTracker = { generation: 0, results: [] }
      const gen = tracker.generation
      simulateAsyncCallback(tracker, gen, 'dns-result')
      expect(tracker.results).toEqual(['dns-result'])
    })

    it('blocks callbacks from stale generation', () => {
      const tracker: GenerationTracker = { generation: 0, results: [] }
      const gen = tracker.generation
      tracker.generation++ // "stop" happened
      simulateAsyncCallback(tracker, gen, 'stale-dns')
      expect(tracker.results).toEqual([])
    })

    it('handles multiple stop/start cycles', () => {
      const tracker: GenerationTracker = { generation: 0, results: [] }

      // Gen 0: start async
      const gen0 = tracker.generation
      // Gen 0: stop
      tracker.generation++
      // Gen 1: start new async
      const gen1 = tracker.generation
      // Gen 1: stop
      tracker.generation++

      // Both callbacks arrive after gen 2
      simulateAsyncCallback(tracker, gen0, 'from-gen0')
      simulateAsyncCallback(tracker, gen1, 'from-gen1')
      expect(tracker.results).toEqual([]) // both stale
    })

    it('current generation callbacks still work after prior invalidations', () => {
      const tracker: GenerationTracker = { generation: 0, results: [] }
      tracker.generation++ // stop gen 0
      tracker.generation++ // stop gen 1
      const gen2 = tracker.generation
      simulateAsyncCallback(tracker, gen2, 'current')
      expect(tracker.results).toEqual(['current'])
    })
  })

  describe('route change detection', () => {
    it('no change on first IP for a hop', () => {
      const hopIPs = new Map<number, string>()
      const result = detectRouteChange(hopIPs, 1, '10.0.0.1')
      expect(result.changed).toBe(false)
      expect(hopIPs.get(1)).toBe('10.0.0.1')
    })

    it('no change when same IP repeats', () => {
      const hopIPs = new Map<number, string>()
      hopIPs.set(1, '10.0.0.1')
      const result = detectRouteChange(hopIPs, 1, '10.0.0.1')
      expect(result.changed).toBe(false)
    })

    it('detects change when IP differs', () => {
      const hopIPs = new Map<number, string>()
      hopIPs.set(1, '10.0.0.1')
      const result = detectRouteChange(hopIPs, 1, '10.0.0.2')
      expect(result.changed).toBe(true)
      expect(result.oldIP).toBe('10.0.0.1')
      expect(hopIPs.get(1)).toBe('10.0.0.2') // updated
    })

    it('tracks changes per-hop independently', () => {
      const hopIPs = new Map<number, string>()
      hopIPs.set(1, '10.0.0.1')
      hopIPs.set(2, '10.0.1.1')

      // Hop 1 changes
      expect(detectRouteChange(hopIPs, 1, '10.0.0.99').changed).toBe(true)
      // Hop 2 stays the same
      expect(detectRouteChange(hopIPs, 2, '10.0.1.1').changed).toBe(false)
    })

    it('detects multiple changes on same hop', () => {
      const hopIPs = new Map<number, string>()
      hopIPs.set(3, 'A')
      expect(detectRouteChange(hopIPs, 3, 'B').changed).toBe(true)
      expect(detectRouteChange(hopIPs, 3, 'C').changed).toBe(true)
      expect(detectRouteChange(hopIPs, 3, 'C').changed).toBe(false)
    })
  })
})
