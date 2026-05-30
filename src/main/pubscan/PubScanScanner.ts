/**
 * Public Scan — an ImmuniWeb-style, fully-local web security test.
 *
 * For a public URL/domain it runs a battery of *passive* checks and rolls them
 * into a single A+→F grade plus a prioritised, categorised findings list:
 *
 *   1. HTTP(S) probe — a single dependency-free request that follows redirects,
 *      captures response headers, Set-Cookie, the (size-capped) HTML body, and
 *      the negotiated TLS parameters from the connection socket.
 *   2. Security headers — HSTS / CSP / X-Frame-Options / X-Content-Type-Options /
 *      Referrer-Policy / Permissions-Policy, plus info-leak headers.
 *   3. Cookies — Secure / HttpOnly / SameSite flags.
 *   4. CSP — parsed for unsafe-inline / unsafe-eval / wildcard sources.
 *   5. Software fingerprint — server / language / CMS / JS-library detection
 *      (fingerprint only; no CVE lookup, to keep everything local).
 *   6. Third-party content — inventory of external origins + known trackers.
 *   7. TLS posture — trust, hostname match, protocol, certificate expiry.
 *   8. DNS / email security — SPF / DMARC / DKIM (reuses DnsDiagnostics) + CAA.
 *   9. Compliance roll-up — GDPR / PCI DSS / NIST mapped from the findings.
 *
 * Like the SSL scanner, nothing is sent to a third-party service — every check
 * runs from the main process over Node's `http`/`https`/`tls`/`dns`.
 */
import * as http from 'http'
import * as https from 'https'
import * as tls from 'tls'
import { isIP } from 'net'
import type { BrowserWindow } from 'electron'
import { IPC } from '../ipc/channels'
import { PubScanStore } from '../store/PubScanStore'
import { checkEmailSecurity } from '../dns/DnsDiagnostics'
import { queryRaw } from '../dns/DnsResolver'
import type {
  PubScanConfig,
  PubScanResult,
  PubScanGrade,
  PubScanCategory,
  PubFinding,
  PubFindingSeverity,
  PubHeaderCheck,
  PubCookie,
  PubCspReport,
  PubTech,
  PubThirdParty,
  PubTlsSummary,
  PubCaa,
  PubComplianceItem,
  PubCategoryGrade,
  PubScanProgressEvent,
  PubScanDoneEvent
} from '../../shared/types'

const REQUEST_TIMEOUT_MS = 12000
const MAX_REDIRECTS = 6
const MAX_BODY_BYTES = 1_500_000   // 1.5 MB of HTML is plenty to fingerprint + inventory

// ── Cancellation tracking ─────────────────────────────────────────────────────

interface RunningScan { requests: Set<http.ClientRequest>; canceled: boolean }
const activeScans = new Map<string, RunningScan>()

// ── URL normalisation ──────────────────────────────────────────────────────────

/** Turn raw user input into a URL we can fetch. Bare hosts default to https://. */
function normaliseInput(raw: string): { url: string; domain: string } | null {
  let s = raw.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return { url: u.toString(), domain: u.hostname }
  } catch {
    return null
  }
}

// ── HTTP(S) probe ────────────────────────────────────────────────────────────────

interface ProbeResult {
  finalUrl: string
  statusCode: number | null
  headers: http.IncomingHttpHeaders
  setCookie: string[]
  body: string
  ip: string | null
  redirects: string[]
  tls: PubTlsSummary | null
  error: string | null
}

function tlsFromSocket(socket: tls.TLSSocket, host: string): PubTlsSummary {
  let cert: tls.PeerCertificate | null = null
  try { cert = socket.getPeerCertificate(false) } catch { cert = null }
  let hostnameMatch = true
  try {
    hostnameMatch = cert ? tls.checkServerIdentity(host, cert as tls.PeerCertificate) === undefined : false
  } catch {
    hostnameMatch = false
  }
  const validTo = cert?.valid_to ? new Date(cert.valid_to) : null
  const validToIso = validTo && !isNaN(validTo.getTime()) ? validTo.toISOString() : null
  const issuerCn = (cert?.issuer as { CN?: string } | undefined)?.CN ?? null
  const subjectCn = (cert?.subject as { CN?: string } | undefined)?.CN ?? null
  return {
    https: true,
    protocol: socket.getProtocol(),
    certIssuer: issuerCn,
    certSubject: subjectCn,
    validTo: validToIso,
    daysRemaining: validToIso ? Math.floor((new Date(validToIso).getTime() - Date.now()) / 86_400_000) : null,
    trusted: socket.authorized,
    hostnameMatch,
    error: null
  }
}

/**
 * Fetch a URL, following redirects up to MAX_REDIRECTS. Captures headers, cookies,
 * a size-capped body, the remote IP, and (for HTTPS) the TLS parameters from the
 * socket of the *final* response. Never throws — failures surface in `error`.
 */
function probe(startUrl: string, scan: RunningScan): Promise<ProbeResult> {
  const redirects: string[] = []
  let lastTls: PubTlsSummary | null = null

  const step = (url: string, depth: number): Promise<ProbeResult> =>
    new Promise((resolve) => {
      const fail = (msg: string): ProbeResult => ({
        finalUrl: url, statusCode: null, headers: {}, setCookie: [], body: '',
        ip: null, redirects, tls: lastTls, error: msg
      })

      let parsed: URL
      try { parsed = new URL(url) } catch { return resolve(fail(`Invalid redirect URL: ${url}`)) }
      redirects.push(url)
      const isHttps = parsed.protocol === 'https:'
      const lib = isHttps ? https : http
      const options: https.RequestOptions = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; nmtr-pubscan/1.0)',
          Accept: 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Connection: 'close'
        },
        timeout: REQUEST_TIMEOUT_MS,
        ...(isHttps ? { rejectUnauthorized: false, servername: isIP(parsed.hostname) ? undefined : parsed.hostname } : {})
      }

      let settled = false
      const req = lib.request(options, (res) => {
        const socket = res.socket
        const ip = socket?.remoteAddress ?? null
        if (isHttps && socket instanceof tls.TLSSocket) {
          lastTls = tlsFromSocket(socket, parsed.hostname)
        }

        const status = res.statusCode ?? null
        const setCookie = res.headers['set-cookie'] ?? []

        // Follow 3xx redirects (with a Location) until we run out of budget.
        if (status && status >= 300 && status < 400 && res.headers.location && depth < MAX_REDIRECTS) {
          res.resume()  // drain
          const next = new URL(res.headers.location, url).toString()
          cleanup()
          resolve(step(next, depth + 1))
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          if (size >= MAX_BODY_BYTES) return
          chunks.push(c)
          size += c.length
          if (size >= MAX_BODY_BYTES) res.destroy()  // got enough HTML to analyse
        })
        const finish = (): void => {
          if (settled) return
          settled = true
          scan.requests.delete(req)
          resolve({
            finalUrl: url,
            statusCode: status,
            headers: res.headers,
            setCookie,
            body: Buffer.concat(chunks).toString('utf8'),
            ip,
            redirects,
            tls: lastTls,
            error: null
          })
        }
        res.on('end', finish)
        res.on('close', finish)
        res.on('error', finish)
      })

      const cleanup = (): void => {
        if (settled) return
        settled = true
        scan.requests.delete(req)
        try { req.destroy() } catch { /* already gone */ }
      }
      const bail = (msg: string): void => {
        if (settled) return
        settled = true
        scan.requests.delete(req)
        try { req.destroy() } catch { /* ignore */ }
        resolve(fail(msg))
      }

      scan.requests.add(req)
      req.on('error', (e: Error) => bail(e.message))
      req.on('timeout', () => bail('Request timed out'))
      req.end()
    })

  return step(startUrl, 0)
}

// ── Header helpers ────────────────────────────────────────────────────────────

function h(headers: http.IncomingHttpHeaders, name: string): string | null {
  const v = headers[name.toLowerCase()]
  if (v === undefined) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// ── Security-header analysis ────────────────────────────────────────────────────

function analyzeHeaders(headers: http.IncomingHttpHeaders, isHttps: boolean): PubHeaderCheck[] {
  const checks: PubHeaderCheck[] = []

  const hsts = h(headers, 'strict-transport-security')
  const maxAge = hsts ? parseInt(hsts.match(/max-age\s*=\s*"?(\d+)"?/i)?.[1] ?? '0', 10) : 0
  checks.push({
    name: 'Strict-Transport-Security',
    present: Boolean(hsts),
    value: hsts,
    status: !isHttps ? 'info' : !hsts ? 'fail' : maxAge < 15_768_000 ? 'warn' : 'pass',
    note: !isHttps ? 'Only relevant over HTTPS' : !hsts ? 'No HSTS — clients may connect over plaintext first' : maxAge < 15_768_000 ? `max-age is ${maxAge}s; ≥ 6 months recommended` : 'HSTS enforced'
  })

  const csp = h(headers, 'content-security-policy')
  checks.push({
    name: 'Content-Security-Policy',
    present: Boolean(csp),
    value: csp,
    status: csp ? 'pass' : 'fail',
    note: csp ? 'CSP present' : 'No CSP — XSS / injection mitigations rely on the browser default'
  })

  const xfo = h(headers, 'x-frame-options')
  const frameAncestors = csp ? /frame-ancestors/i.test(csp) : false
  checks.push({
    name: 'X-Frame-Options',
    present: Boolean(xfo),
    value: xfo,
    status: xfo || frameAncestors ? 'pass' : 'fail',
    note: xfo ? `Clickjacking protection (${xfo})` : frameAncestors ? 'Covered by CSP frame-ancestors' : 'No clickjacking protection'
  })

  const xcto = h(headers, 'x-content-type-options')
  checks.push({
    name: 'X-Content-Type-Options',
    present: Boolean(xcto),
    value: xcto,
    status: /nosniff/i.test(xcto ?? '') ? 'pass' : 'warn',
    note: /nosniff/i.test(xcto ?? '') ? 'MIME-sniffing disabled' : 'Missing "nosniff" — browsers may MIME-sniff responses'
  })

  const ref = h(headers, 'referrer-policy')
  checks.push({
    name: 'Referrer-Policy',
    present: Boolean(ref),
    value: ref,
    status: ref ? 'pass' : 'warn',
    note: ref ? `Referrer policy set (${ref})` : 'No Referrer-Policy — full URLs may leak to third parties'
  })

  const perms = h(headers, 'permissions-policy') ?? h(headers, 'feature-policy')
  checks.push({
    name: 'Permissions-Policy',
    present: Boolean(perms),
    value: perms,
    status: perms ? 'pass' : 'info',
    note: perms ? 'Browser feature access restricted' : 'No Permissions-Policy — powerful features are unrestricted'
  })

  // Information-disclosure headers. Only flag a Server header that leaks an actual
  // version *number* — "Name/1.2.3" or a dotted version token — not a product name
  // that merely contains a digit (e.g. "AmazonS3", "Microsoft-IIS" without a version).
  const server = h(headers, 'server')
  if (server && /\/\s*\d|\b\d+\.\d+/.test(server)) {
    checks.push({ name: 'Server', present: true, value: server, status: 'warn', note: `Server header discloses software version: "${server}"` })
  }
  const poweredBy = h(headers, 'x-powered-by')
  if (poweredBy) {
    checks.push({ name: 'X-Powered-By', present: true, value: poweredBy, status: 'warn', note: `X-Powered-By discloses backend technology: "${poweredBy}"` })
  }

  return checks
}

// ── Cookie analysis ──────────────────────────────────────────────────────────────

function analyzeCookies(setCookie: string[]): PubCookie[] {
  return setCookie.map((line) => {
    const name = line.split('=')[0]?.trim() ?? '?'
    const sameSite = line.match(/;\s*SameSite\s*=\s*(Strict|Lax|None)/i)?.[1] ?? null
    return {
      name,
      secure: /;\s*Secure/i.test(line),
      httpOnly: /;\s*HttpOnly/i.test(line),
      sameSite: sameSite ? sameSite[0].toUpperCase() + sameSite.slice(1).toLowerCase() : null
    }
  })
}

// ── CSP analysis ─────────────────────────────────────────────────────────────────

function analyzeCsp(csp: string | null): PubCspReport {
  if (!csp) return { present: false, raw: null, directiveCount: 0, issues: [] }
  const directives = csp.split(';').map((d) => d.trim()).filter(Boolean)
  const issues: string[] = []
  const lower = csp.toLowerCase()
  const scriptCtx = directives.find((d) => /^script-src/i.test(d)) ?? directives.find((d) => /^default-src/i.test(d)) ?? ''
  if (/'unsafe-inline'/i.test(scriptCtx)) issues.push("script-src allows 'unsafe-inline' — defeats most XSS protection")
  if (/'unsafe-eval'/i.test(lower)) issues.push("'unsafe-eval' is allowed — enables eval-based code execution")
  if (/(script-src|default-src)[^;]*\*(\s|;|$)/i.test(csp)) issues.push('A wildcard (*) source is allowed for scripts')
  if (!/default-src/i.test(lower) && !/script-src/i.test(lower)) issues.push('No default-src or script-src directive')
  if (!/object-src/i.test(lower) && !/default-src/i.test(lower)) issues.push("No object-src 'none' — legacy plugin content not blocked")
  return { present: true, raw: csp, directiveCount: directives.length, issues }
}

// ── Software fingerprinting ──────────────────────────────────────────────────────

function fingerprint(headers: http.IncomingHttpHeaders, body: string): PubTech[] {
  const tech: PubTech[] = []
  const seen = new Set<string>()
  const add = (name: string, version: string | null, category: PubTech['category'], source: string): void => {
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    tech.push({ name, version, category, source })
  }

  const server = h(headers, 'server')
  if (server) {
    const m = server.match(/^([A-Za-z][\w-]*)(?:\/([\d.]+))?/)
    if (m) add(m[1], m[2] ?? null, /cloudflare|cloudfront|akamai|fastly/i.test(m[1]) ? 'cdn' : 'server', 'Server header')
  }
  const poweredBy = h(headers, 'x-powered-by')
  if (poweredBy) {
    const m = poweredBy.match(/^([\w.\- ]+?)(?:\/([\d.]+))?$/)
    if (m) add(m[1].trim(), m[2] ?? null, 'language', 'X-Powered-By header')
  }
  if (h(headers, 'x-aspnet-version')) add('ASP.NET', h(headers, 'x-aspnet-version'), 'framework', 'X-AspNet-Version header')
  if (h(headers, 'cf-ray')) add('Cloudflare', null, 'cdn', 'cf-ray header')

  // Body-based detection.
  const gen = body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1]
  if (gen) {
    const gm = gen.match(/^([A-Za-z][\w .]*?)\s*([\d.]+)?$/)
    add(gm?.[1]?.trim() ?? gen, gm?.[2] ?? null, 'cms', 'meta generator')
  }
  if (/\/wp-(content|includes)\//i.test(body)) add('WordPress', null, 'cms', 'wp-content path')
  if (/Drupal\.settings|\/sites\/(default|all)\//i.test(body)) add('Drupal', null, 'cms', 'Drupal markup')
  if (/\/media\/jui\/|content=["']Joomla/i.test(body)) add('Joomla', null, 'cms', 'Joomla markup')
  if (/Shopify\.theme|cdn\.shopify\.com/i.test(body)) add('Shopify', null, 'cms', 'Shopify assets')

  const jq = body.match(/jquery[.-]?(\d+\.\d+(?:\.\d+)?)(?:\.min)?\.js/i)?.[1]
  if (jq || /jquery/i.test(body)) add('jQuery', jq ?? null, 'js-library', 'script reference')
  if (/data-reactroot|__REACT_DEVTOOLS|\/react(?:-dom)?[.@-]/i.test(body)) add('React', null, 'js-library', 'React markup')
  if (/data-v-[0-9a-f]{8}|__VUE__|\bVue\b/.test(body)) add('Vue.js', null, 'js-library', 'Vue markup')
  if (/ng-version=["']([\d.]+)["']/i.test(body)) add('Angular', body.match(/ng-version=["']([\d.]+)["']/i)?.[1] ?? null, 'js-library', 'ng-version')
  if (/bootstrap[.-]?(\d+\.\d+(?:\.\d+)?)?(?:\.min)?\.(?:css|js)/i.test(body)) add('Bootstrap', body.match(/bootstrap[.-]?(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? null, 'framework', 'asset reference')

  return tech
}

// ── Third-party inventory ───────────────────────────────────────────────────────

const TRACKER_HOSTS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'googlesyndication.com',
  'facebook.net', 'facebook.com', 'connect.facebook.net', 'hotjar.com', 'segment.com',
  'mixpanel.com', 'fullstory.com', 'clarity.ms', 'amplitude.com', 'matomo', 'scorecardresearch.com',
  'adservice.google.com', 'analytics.tiktok.com', 'bing.com', 'criteo'
]

function isTracker(host: string): boolean {
  return TRACKER_HOSTS.some((t) => host.includes(t))
}

/** Same registrable site if the resource host equals or is a sub/parent of the page host. */
function sameSite(resourceHost: string, pageHost: string): boolean {
  if (resourceHost === pageHost) return true
  const parts = pageHost.split('.')
  const reg = parts.slice(-2).join('.')
  return resourceHost === reg || resourceHost.endsWith(`.${reg}`)
}

function thirdPartyInventory(body: string, pageHost: string): PubThirdParty[] {
  const patterns: { re: RegExp; kind: string }[] = [
    { re: /<script[^>]+src=["']([^"']+)["']/gi, kind: 'script' },
    { re: /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi, kind: 'stylesheet' },
    { re: /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi, kind: 'stylesheet' },
    { re: /<iframe[^>]+src=["']([^"']+)["']/gi, kind: 'iframe' },
    { re: /<img[^>]+src=["']([^"']+)["']/gi, kind: 'image' }
  ]
  const byHost = new Map<string, { kinds: Set<string>; count: number }>()
  for (const { re, kind } of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      const raw = m[1]
      let host: string
      try {
        host = new URL(raw, `https://${pageHost}`).hostname
      } catch {
        continue
      }
      if (!host || sameSite(host, pageHost)) continue
      const entry = byHost.get(host) ?? { kinds: new Set<string>(), count: 0 }
      entry.kinds.add(kind)
      entry.count++
      byHost.set(host, entry)
    }
  }
  return [...byHost.entries()]
    .map(([host, v]) => ({ host, kinds: [...v.kinds], count: v.count, tracker: isTracker(host) }))
    .sort((a, b) => Number(b.tracker) - Number(a.tracker) || b.count - a.count)
}

// ── Findings + grading ─────────────────────────────────────────────────────────

const SEVERITY_PENALTY: Record<PubFindingSeverity, number> = {
  critical: 45, high: 25, medium: 12, low: 5, info: 0
}
const CATEGORIES: PubScanCategory[] = ['headers', 'cookies', 'csp', 'tls', 'dns', 'software', 'privacy']

// Relative weight of each category in the overall score. TLS and headers matter
// most; software/privacy least. The overall grade is a weighted average of the
// per-category scores (not a flat sum of every penalty) so that a handful of
// issues confined to one or two areas can't drag an otherwise-clean site down —
// the headline grade stays consistent with the per-category badges.
const CATEGORY_WEIGHT: Record<PubScanCategory, number> = {
  tls: 25, headers: 20, csp: 15, cookies: 15, dns: 10, software: 10, privacy: 5
}

function scoreToGrade(score: number): PubScanGrade {
  if (score >= 95) return 'A+'
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

/** Per-category score (0–100): start at 100, subtract that category's penalties. */
function categoryScore(findings: PubFinding[], category: PubScanCategory): number {
  const penalty = findings
    .filter((f) => f.category === category)
    .reduce((s, f) => s + SEVERITY_PENALTY[f.severity], 0)
  return Math.max(0, 100 - penalty)
}

function gradeFromFindings(findings: PubFinding[]): PubScanGrade {
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_PENALTY[f.severity], 0))
  return scoreToGrade(score)
}

/**
 * Overall 0–100 score: a weighted average of the per-category scores, then
 * capped for genuinely serious issues so a critical/high finding can't hide
 * behind otherwise-perfect categories.
 */
function overallScore(findings: PubFinding[]): number {
  let weighted = 0
  let totalWeight = 0
  for (const cat of CATEGORIES) {
    const w = CATEGORY_WEIGHT[cat]
    weighted += w * categoryScore(findings, cat)
    totalWeight += w
  }
  let score = totalWeight > 0 ? weighted / totalWeight : 100
  // Severity caps: a critical issue caps the grade at F, a high issue at C.
  if (findings.some((f) => f.severity === 'critical')) score = Math.min(score, 39)
  else if (findings.some((f) => f.severity === 'high')) score = Math.min(score, 74)
  return Math.round(score)
}

function buildFindings(parts: {
  headers: PubHeaderCheck[]
  cookies: PubCookie[]
  csp: PubCspReport
  tech: PubTech[]
  thirdParty: PubThirdParty[]
  tls: PubTlsSummary | null
  email: PubScanResult['email']
  caa: PubCaa | null
  isHttps: boolean
}): PubFinding[] {
  const f: PubFinding[] = []
  const add = (category: PubScanCategory, severity: PubFindingSeverity, slug: string, title: string, detail: string, recommendation: string | null): void => {
    f.push({ id: `${category}:${slug}`, category, severity, title, detail, recommendation })
  }

  // Headers
  for (const c of parts.headers) {
    if (c.status === 'pass' || c.status === 'info') continue
    const sev: PubFindingSeverity =
      c.name === 'Content-Security-Policy' || c.name === 'X-Frame-Options' ? 'medium'
        : c.name === 'Strict-Transport-Security' && c.status === 'fail' ? 'high'
          : c.status === 'warn' ? 'low' : 'medium'
    add('headers', sev, c.name.toLowerCase(), `${c.status === 'warn' ? 'Weak' : 'Missing'} ${c.name}`, c.note,
      `Set the ${c.name} response header.`)
  }

  // Cookies
  if (parts.isHttps) {
    for (const ck of parts.cookies.filter((c) => !c.secure)) {
      add('cookies', 'medium', `secure-${ck.name}`, `Cookie "${ck.name}" missing Secure flag`,
        'Cookie can be transmitted over plaintext HTTP.', 'Add the Secure attribute to this cookie.')
    }
  }
  for (const ck of parts.cookies.filter((c) => !c.httpOnly)) {
    add('cookies', 'low', `httponly-${ck.name}`, `Cookie "${ck.name}" missing HttpOnly flag`,
      'Cookie is readable from JavaScript (XSS theft risk).', 'Add the HttpOnly attribute where the cookie is not needed in JS.')
  }
  for (const ck of parts.cookies.filter((c) => c.sameSite === null)) {
    add('cookies', 'low', `samesite-${ck.name}`, `Cookie "${ck.name}" missing SameSite attribute`,
      'No SameSite — exposes the cookie to CSRF.', 'Set SameSite=Lax or Strict.')
  }

  // CSP
  for (const issue of parts.csp.issues) {
    add('csp', 'medium', issue.slice(0, 24).replace(/\W+/g, '-').toLowerCase(), 'Weak Content-Security-Policy', issue,
      'Tighten the CSP — avoid unsafe-inline/unsafe-eval and wildcard sources.')
  }

  // TLS
  if (parts.tls) {
    const t = parts.tls
    if (!t.trusted) add('tls', 'high', 'untrusted', 'TLS certificate not trusted', 'The certificate chain did not validate against the system trust store.', 'Install a valid certificate from a trusted CA.')
    if (!t.hostnameMatch) add('tls', 'high', 'hostname', 'TLS hostname mismatch', 'The certificate is not valid for this hostname.', 'Issue a certificate covering this hostname.')
    if (t.protocol && /TLSv1(\.[01])?$/.test(t.protocol) && t.protocol !== 'TLSv1.2' && t.protocol !== 'TLSv1.3') {
      add('tls', 'high', 'old-proto', `Obsolete TLS (${t.protocol})`, 'The connection negotiated a deprecated TLS version.', 'Disable TLS 1.0/1.1; require TLS 1.2+.')
    }
    if (t.daysRemaining !== null && t.daysRemaining < 0) add('tls', 'critical', 'expired', 'TLS certificate expired', `Expired ${Math.abs(t.daysRemaining)} day(s) ago.`, 'Renew the certificate immediately.')
    else if (t.daysRemaining !== null && t.daysRemaining <= 21) add('tls', 'medium', 'expiring', 'TLS certificate expiring soon', `Expires in ${t.daysRemaining} day(s).`, 'Renew the certificate.')
  }
  if (!parts.isHttps) {
    add('tls', 'high', 'no-https', 'Site served over plaintext HTTP', 'The site did not redirect to HTTPS.', 'Redirect all HTTP traffic to HTTPS and enable HSTS.')
  }

  // DNS / email
  if (parts.email && !parts.email.error) {
    if (parts.email.spf.status === 'fail') add('dns', 'medium', 'spf', 'No/weak SPF record', parts.email.spf.note, 'Publish an SPF record ending in -all.')
    if (parts.email.dmarc.status === 'fail') add('dns', 'medium', 'dmarc', 'No DMARC record', parts.email.dmarc.note, 'Publish a DMARC record with a quarantine/reject policy.')
    else if (parts.email.dmarc.status === 'warn') add('dns', 'low', 'dmarc-weak', 'Weak DMARC policy', parts.email.dmarc.note, 'Move DMARC to p=quarantine or p=reject.')
  }
  if (parts.caa && !parts.caa.present) {
    add('dns', 'low', 'caa', 'No CAA record', 'No CAA record restricts which CAs may issue for this domain.', 'Publish a CAA record naming your CA.')
  }

  // Software / privacy
  for (const t of parts.tech.filter((x) => x.version && (x.category === 'server' || x.category === 'language' || x.category === 'framework'))) {
    add('software', 'low', `version-${t.name.toLowerCase()}`, `${t.name} version disclosed`, `${t.name} ${t.version} is exposed in responses.`, `Suppress version details for ${t.name}.`)
  }
  const trackers = parts.thirdParty.filter((t) => t.tracker)
  if (trackers.length > 0) {
    add('privacy', 'info', 'trackers', `${trackers.length} third-party tracker${trackers.length > 1 ? 's' : ''} detected`,
      `Loads: ${trackers.map((t) => t.host).join(', ')}.`, 'Ensure tracking has a lawful basis / consent (GDPR) and a privacy policy.')
  }

  return f
}

function categoryGrades(findings: PubFinding[]): PubCategoryGrade[] {
  return CATEGORIES.map((category) => ({
    category,
    grade: gradeFromFindings(findings.filter((f) => f.category === category))
  }))
}

function compliance(findings: PubFinding[], tls: PubTlsSummary | null, isHttps: boolean, thirdParty: PubThirdParty[]): PubComplianceItem[] {
  const has = (pred: (f: PubFinding) => boolean): boolean => findings.some(pred)
  const tlsBroken = !isHttps || (tls ? !tls.trusted || !tls.hostnameMatch : true)
  const missingHsts = has((f) => f.id === 'headers:strict-transport-security')
  const tlsFindings = findings.filter((f) => f.category === 'tls')
  const headerFindings = findings.filter((f) => f.category === 'headers' || f.category === 'csp')
  const highOrCrit = findings.filter((f) => f.severity === 'high' || f.severity === 'critical')

  // PCI DSS — strong transport + no high/critical exposure.
  const pci: PubComplianceItem = { framework: 'PCI DSS', status: 'pass', notes: [], details: [] }
  if (tlsBroken) { pci.status = 'fail'; pci.notes.push('Strong TLS is required for cardholder data.') }
  if (missingHsts) { pci.notes.push('HSTS recommended to prevent downgrade.'); if (pci.status === 'pass') pci.status = 'warn' }
  if (highOrCrit.length > 0 && pci.status !== 'fail') pci.status = 'warn'
  pci.details = [...tlsFindings, ...highOrCrit.filter((f) => f.category !== 'tls')].map((f) => `${f.title} — ${f.detail}`)
  if (pci.notes.length === 0) pci.notes.push('No transport-security blockers detected.')

  // NIST 800-53 (SC controls) — transport + header hardening.
  const nist: PubComplianceItem = { framework: 'NIST 800-53', status: 'pass', notes: [], details: [] }
  if (tlsBroken) { nist.status = 'fail'; nist.notes.push('SC-8/SC-23: transmission confidentiality/integrity not assured.') }
  if (headerFindings.length > 0) { nist.notes.push(`${headerFindings.length} hardening header gap(s).`); if (nist.status === 'pass') nist.status = 'warn' }
  nist.details = [...tlsFindings.filter((f) => f.id !== 'tls:no-https'), ...headerFindings].map((f) => `${f.title} — ${f.detail}`)
  if (nist.notes.length === 0) nist.notes.push('Transport and headers meet baseline controls.')

  // GDPR — privacy / tracking + secure transport.
  const gdpr: PubComplianceItem = { framework: 'GDPR', status: 'pass', notes: [], details: [] }
  const trackers = thirdParty.filter((t) => t.tracker)
  if (trackers.length > 0) { gdpr.status = 'warn'; gdpr.notes.push('Third-party trackers require a lawful basis / consent.') }
  if (tlsBroken) { gdpr.status = 'fail'; gdpr.notes.push('Art. 32: personal data must be transmitted securely.') }
  gdpr.details = [
    ...trackers.map((t) => `Tracker: ${t.host} (${t.kinds.join(', ')})`),
    ...tlsFindings.map((f) => `${f.title} — ${f.detail}`)
  ]
  if (gdpr.notes.length === 0) gdpr.notes.push('No tracking or transport issues detected (consent/policy not verifiable automatically).')

  return [gdpr, pci, nist]
}

// ── Progress emit ────────────────────────────────────────────────────────────────

function emitProgress(win: BrowserWindow, payload: PubScanProgressEvent): void {
  if (!win.isDestroyed()) win.webContents.send(IPC.PUBSCAN_PROGRESS, payload)
}
function emitDone(win: BrowserWindow, payload: PubScanDoneEvent): void {
  if (!win.isDestroyed()) win.webContents.send(IPC.PUBSCAN_DONE, payload)
}

// ── CAA lookup (best-effort) ──────────────────────────────────────────────────────

async function lookupCaa(domain: string): Promise<PubCaa | null> {
  try {
    const res = await queryRaw('1.1.1.1', domain, 'CAA', { doBit: false })
    if (res.error) return null
    const records = res.records.map((r) => r.value)
    return { present: records.length > 0, records }
  } catch {
    return null
  }
}

/**
 * Does the domain publish MX records? If not, it does not receive email, so the
 * mail-security checks (SPF/DMARC/DKIM) are not applicable — we skip them entirely
 * rather than penalise the grade for "missing" records that aren't expected.
 */
async function hasMxRecord(domain: string): Promise<boolean> {
  try {
    const res = await queryRaw('1.1.1.1', domain, 'MX', { doBit: false })
    return !res.error && res.records.length > 0
  } catch {
    return false
  }
}

// ── Orchestrator ────────────────────────────────────────────────────────────────

/**
 * Run a full public web-security scan. Resolves once complete; progress streams
 * via PUBSCAN_PROGRESS and the result lands via PUBSCAN_DONE.
 */
export async function startPubScan(scanId: string, config: PubScanConfig, win: BrowserWindow): Promise<void> {
  const startedAt = Date.now()
  const scan: RunningScan = { requests: new Set(), canceled: false }
  activeScans.set(scanId, scan)

  const norm = normaliseInput(config.url)
  const fail = (error: string, domain = '', url = config.url): void => {
    activeScans.delete(scanId)
    emitDone(win, {
      scanId,
      result: {
        scanId, input: config.url, domain, url, finalUrl: url, ip: null, statusCode: null,
        redirects: [], grade: 'F', categoryGrades: [], score: 0, headers: [], cookies: [],
        csp: { present: false, raw: null, directiveCount: 0, issues: [] }, tech: [], thirdParty: [],
        tls: null, email: null, caa: null, compliance: [], findings: [], diff: null,
        startedAt, durationMs: Date.now() - startedAt, error
      }
    })
  }

  if (!norm) return fail('Invalid URL or domain.')

  try {
    // 1. HTTP(S) probe.
    emitProgress(win, { scanId, percent: 5, message: `Fetching ${norm.url}…` })
    const res = await probe(norm.url, scan)
    if (scan.canceled) return fail('Scan canceled.', norm.domain, norm.url)
    if (res.error && res.statusCode === null) return fail(res.error, norm.domain, norm.url)

    const finalUrl = res.finalUrl
    const isHttps = finalUrl.startsWith('https:')

    // 2. Header / cookie / CSP analysis.
    emitProgress(win, { scanId, percent: 35, message: 'Analysing security headers…' })
    const headers = analyzeHeaders(res.headers, isHttps)
    const cookies = analyzeCookies(res.setCookie)
    const csp = analyzeCsp(h(res.headers, 'content-security-policy'))

    // 3. Fingerprint + third-party inventory.
    emitProgress(win, { scanId, percent: 55, message: 'Fingerprinting software & third-party content…' })
    const tech = fingerprint(res.headers, res.body)
    const thirdParty = thirdPartyInventory(res.body, norm.domain)

    // 4. DNS / email security + CAA (parallel). Email security is only checked
    //    when the domain has MX records — a domain that receives no mail isn't
    //    expected to publish SPF/DMARC/DKIM, so we neither show nor grade it.
    emitProgress(win, { scanId, percent: 75, message: 'Checking DNS & email security…' })
    const [hasMx, caa] = await Promise.all([
      hasMxRecord(norm.domain),
      lookupCaa(norm.domain)
    ])
    const email = hasMx ? await checkEmailSecurity(norm.domain, '').catch(() => null) : null
    if (scan.canceled) return fail('Scan canceled.', norm.domain, norm.url)

    // 5. Findings + grade + compliance.
    emitProgress(win, { scanId, percent: 92, message: 'Scoring…' })
    const findings = buildFindings({ headers, cookies, csp, tech, thirdParty, tls: res.tls, email, caa, isHttps })
    const score = overallScore(findings)
    let grade = scoreToGrade(score)
    // The score already governs the grade (and high/critical findings are capped
    // in overallScore, so they can't reach A+). A+ additionally requires HSTS —
    // the one best-practice signal not otherwise reflected in the score.
    const hstsOk = headers.some((c) => c.name === 'Strict-Transport-Security' && c.status === 'pass')
    if (grade === 'A+' && !hstsOk) grade = 'A'

    const result: PubScanResult = {
      scanId, input: config.url, domain: norm.domain, url: norm.url, finalUrl,
      ip: res.ip, statusCode: res.statusCode, redirects: res.redirects,
      grade, categoryGrades: categoryGrades(findings), score,
      headers, cookies, csp, tech, thirdParty, tls: res.tls, email, caa,
      compliance: compliance(findings, res.tls, isHttps, thirdParty),
      findings, diff: null, startedAt, durationMs: Date.now() - startedAt, error: null
    }

    try { result.diff = PubScanStore.commit(result) } catch { result.diff = null }

    activeScans.delete(scanId)
    emitProgress(win, { scanId, percent: 100, message: 'Done' })
    emitDone(win, { scanId, result })
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), norm.domain, norm.url)
  }
}

/** Cancel a running scan, destroying all in-flight requests. */
export function cancelPubScan(scanId: string): void {
  const scan = activeScans.get(scanId)
  if (!scan) return
  scan.canceled = true
  for (const req of scan.requests) {
    try { req.destroy() } catch { /* ignore */ }
  }
}
