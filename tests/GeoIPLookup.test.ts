import { describe, it, expect } from 'vitest'
import { GeoIPLookup } from '../src/main/enrichment/GeoIPLookup'

describe('GeoIPLookup', () => {
  it('returns Private Network for empty IP', async () => {
    const result = await GeoIPLookup.lookup('')
    expect(result.isp).toBe('Private Network')
  })

  it('returns Private Network for RFC 1918 addresses', async () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '192.168.1.1', '127.0.0.1']) {
      const result = await GeoIPLookup.lookup(ip)
      expect(result.isp).toBe('Private Network')
      expect(result.asn).toBeNull()
    }
  })

  it('returns Private Network for IPv6 private addresses', async () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1']) {
      const result = await GeoIPLookup.lookup(ip)
      expect(result.isp).toBe('Private Network')
    }
  })

  it('caches results for repeated lookups', async () => {
    const r1 = await GeoIPLookup.lookup('10.0.0.1')
    const r2 = await GeoIPLookup.lookup('10.0.0.1')
    expect(r1).toEqual(r2)
  })
})
