import { describe, it, expect } from 'vitest'
import { formatExport } from '../src/main/export/ExportFormatter'
import type { HopStats, TraceConfig } from '../src/shared/types'

function makeHop(overrides: Partial<HopStats> = {}): HopStats {
  return {
    hopIndex: 1,
    ip: '1.2.3.4',
    hostname: 'router.local',
    enrichment: null,
    loss: 0,
    sent: 10,
    recv: 10,
    last: 5.2,
    avg: 5.0,
    best: 3.1,
    worst: 8.4,
    jitter: 1.2,
    sparkline: new Array(60).fill(null),
    ...overrides
  }
}

const config: TraceConfig = {
  target: '8.8.8.8',
  protocol: 'icmp',
  intervalMs: 500,
  packetSize: 64,
  maxHops: 30,
  useIPv6: false,
  resolveHostnames: true
}

describe('ExportFormatter', () => {
  describe('text format', () => {
    it('returns text/plain mime type', () => {
      const result = formatExport([], config, 'text')
      expect(result.mimeType).toBe('text/plain')
      expect(result.suggestedFilename).toMatch(/\.txt$/)
    })

    it('includes target in header', () => {
      const result = formatExport([], config, 'text')
      expect(result.content).toContain('8.8.8.8')
    })

    it('includes hop data rows', () => {
      const hops = [makeHop({ hopIndex: 1 }), makeHop({ hopIndex: 2, ip: '5.6.7.8' })]
      const result = formatExport(hops, config, 'text')
      expect(result.content).toContain('router.local')
      expect(result.content).toContain('5.0')
    })

    it('handles null RTT values', () => {
      const hops = [makeHop({ avg: null, best: null, worst: null, last: null, jitter: null })]
      const result = formatExport(hops, config, 'text')
      expect(result.content).toContain('---')
    })
  })

  describe('csv format', () => {
    it('returns text/csv mime type', () => {
      const result = formatExport([], config, 'csv')
      expect(result.mimeType).toBe('text/csv')
      expect(result.suggestedFilename).toMatch(/\.csv$/)
    })

    it('starts with UTF-8 BOM', () => {
      const result = formatExport([], config, 'csv')
      expect(result.content.charCodeAt(0)).toBe(0xFEFF)
    })

    it('has header row with expected columns', () => {
      const result = formatExport([], config, 'csv')
      expect(result.content).toContain('Hop,Hostname,IP,ASN,ISP,Country,City')
    })

    it('quotes hostnames and ISP names', () => {
      const hops = [makeHop({ hostname: 'my,host' })]
      const result = formatExport(hops, config, 'csv')
      expect(result.content).toContain('"my,host"')
    })
  })

  describe('html format', () => {
    it('returns text/html mime type', () => {
      const result = formatExport([], config, 'html')
      expect(result.mimeType).toBe('text/html')
      expect(result.suggestedFilename).toMatch(/\.html$/)
    })

    it('is a complete HTML document', () => {
      const result = formatExport([], config, 'html')
      expect(result.content).toContain('<!doctype html>')
      expect(result.content).toContain('</html>')
    })

    it('color-codes loss levels', () => {
      const hops = [
        makeHop({ hopIndex: 1, loss: 0 }),
        makeHop({ hopIndex: 2, loss: 5 }),
        makeHop({ hopIndex: 3, loss: 25 })
      ]
      const result = formatExport(hops, config, 'html')
      expect(result.content).toContain('class="good"')
      expect(result.content).toContain('class="warn"')
      expect(result.content).toContain('class="bad"')
    })
  })
})
