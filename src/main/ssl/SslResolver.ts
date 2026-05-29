/**
 * SSL endpoint resolver — turns the user's host input into the list of IP
 * endpoints they can pick from before running a TLS scan.
 *
 * An IP literal is returned as a single endpoint (no DNS). A hostname is
 * resolved via the OS resolver (`dns.lookup` with `all`), which honours the
 * system's A/AAAA results just like a browser would when connecting. The
 * input may be a bare host or a URL (`https://example.com/path`) — the
 * hostname is extracted in either case.
 */
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import type { SslResolveConfig, SslResolveResult, SslEndpoint } from '../../shared/types'

const HOST_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9.\]])?$/

/**
 * Normalise the input into a bare hostname/IP. Accepts URLs (strips scheme,
 * path, port, and IPv6 brackets) and trailing dots. Throws on invalid input.
 */
export function normaliseHost(input: string): string {
  let h = input.trim()
  if (!h) throw new Error('Enter a hostname, URL, or IP address.')

  // Pull the host out of a URL if one was pasted.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) {
    try {
      h = new URL(h).hostname
    } catch {
      throw new Error('Could not parse that URL.')
    }
  } else if (h.includes('/')) {
    h = h.split('/')[0]
  }

  // Strip an explicit port (host:443) but keep IPv6 groups intact.
  if (h.startsWith('[')) {
    h = h.replace(/^\[|\].*$/g, '') // [::1]:443 → ::1
  } else if (isIP(h) !== 6 && h.includes(':') && h.split(':').length === 2) {
    h = h.split(':')[0]
  }

  h = h.replace(/\.$/, '')
  if (!h || (!isIP(h) && !HOST_RE.test(h))) {
    throw new Error('Invalid host. Enter a hostname, URL, or IP address.')
  }
  return h
}

/**
 * Resolve a host to its IP endpoints. Never throws — failures land in
 * `result.error`. IP literals short-circuit to a single endpoint.
 */
export async function resolveEndpoints(config: SslResolveConfig): Promise<SslResolveResult> {
  let host: string
  try {
    host = normaliseHost(config.host)
  } catch (err) {
    return { host: config.host, inputWasIp: false, endpoints: [], error: err instanceof Error ? err.message : String(err) }
  }

  const ipKind = isIP(host)
  if (ipKind) {
    return {
      host,
      inputWasIp: true,
      endpoints: [{ ip: host, family: ipKind as 4 | 6 }],
      error: null
    }
  }

  try {
    const addrs = await lookup(host, { all: true, verbatim: true })
    const seen = new Set<string>()
    const endpoints: SslEndpoint[] = []
    for (const a of addrs) {
      if (seen.has(a.address)) continue
      seen.add(a.address)
      endpoints.push({ ip: a.address, family: a.family as 4 | 6 })
    }
    if (endpoints.length === 0) {
      return { host, inputWasIp: false, endpoints: [], error: `No A/AAAA records found for ${host}.` }
    }
    return { host, inputWasIp: false, endpoints, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { host, inputWasIp: false, endpoints: [], error: `DNS resolution failed: ${msg}` }
  }
}
