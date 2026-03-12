import dns from 'dns'
import { LRUCache } from 'lru-cache'

const cache = new LRUCache<string, string>({
  max: 1000,
  ttl: 10 * 60 * 1000 // 10 minutes
})

/**
 * Reverse-resolve an IP address to a hostname.
 * Results are cached in an LRU cache (1000 entries, 10-min TTL).
 * Returns null if resolution fails or IP is private/unresolvable.
 */
export async function reverseDns(ip: string): Promise<string | null> {
  if (!ip) return null

  const cached = cache.get(ip)
  if (cached !== undefined) return cached

  return new Promise((resolve) => {
    dns.reverse(ip, (err, hostnames) => {
      if (err || !hostnames || hostnames.length === 0) {
        cache.set(ip, ip) // Cache the IP itself to avoid re-querying
        resolve(null)
      } else {
        const hostname = hostnames[0]
        cache.set(ip, hostname)
        resolve(hostname)
      }
    })
  })
}
