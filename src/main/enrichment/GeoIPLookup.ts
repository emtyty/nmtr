import { LRUCache } from 'lru-cache'
import type { EnrichmentData } from '../../shared/types'

// p-queue v8 is ESM-only; handle the CJS interop wrapper
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PQueueMod = require('p-queue')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PQueue: typeof import('p-queue').default = (PQueueMod as any).default ?? PQueueMod

// Private IP ranges — never sent to external APIs
const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i
]

const PRIVATE_RESULT: EnrichmentData = {
  asn: null,
  isp: 'Private Network',
  country: null,
  countryCode: null,
  city: null,
  lat: null,
  lng: null
}

// LRU cache — IPs rarely change org
const cache = new LRUCache<string, EnrichmentData>({ max: 10000 })

// Rate-limit ip-api.com to 40 req/min (free tier allows 45)
const queue = new PQueue({ concurrency: 5, intervalCap: 40, interval: 60_000 })

function isPrivate(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip))
}

async function fetchIpApi(ip: string): Promise<EnrichmentData> {
  try {
    const url = `http://ip-api.com/json/${ip}?fields=as,org,country,countryCode,city,lat,lon`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return PRIVATE_RESULT
    const data = (await res.json()) as {
      as?: string
      org?: string
      country?: string
      countryCode?: string
      city?: string
      lat?: number
      lon?: number
    }
    return {
      asn: data.as?.split(' ')[0] ?? null, // "AS15169 Google LLC" → "AS15169"
      isp: data.org ?? data.as?.slice(data.as.indexOf(' ') + 1) ?? null,
      country: data.country ?? null,
      countryCode: data.countryCode ?? null,
      city: data.city ?? null,
      lat: data.lat ?? null,
      lng: data.lon ?? null
    }
  } catch {
    return PRIVATE_RESULT
  }
}

export const GeoIPLookup = {
  async lookup(ip: string): Promise<EnrichmentData> {
    if (!ip) return PRIVATE_RESULT

    const cached = cache.get(ip)
    if (cached) return cached

    if (isPrivate(ip)) {
      cache.set(ip, PRIVATE_RESULT)
      return PRIVATE_RESULT
    }

    const result = await queue.add(() => fetchIpApi(ip)) as EnrichmentData
    cache.set(ip, result)
    return result
  }
}
