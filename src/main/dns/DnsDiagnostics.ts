/**
 * DNS diagnostics — higher-level checks built on the queryRaw primitive:
 *   • Propagation across public resolvers (feature 2)
 *   • Email-security records: SPF / DMARC / DKIM / MTA-STS / BIMI (feature 4)
 *   • Forward-confirmed reverse DNS / FCrDNS (feature 5)
 *   • Delegation trace from the root, à la `dig +trace` (feature 6)
 */
import { isIP } from 'net'
import {
  queryRaw,
  pickResolver,
  reverseName,
  validateTarget
} from './DnsResolver'
import type {
  DnsPropagationResult,
  DnsPropagationEntry,
  DnsRecordType,
  DnsEmailSecurity,
  DnsEmailCheck,
  DnsFcrdnsResult,
  DnsFcrdnsEntry,
  DnsDelegationResult,
  DnsDelegationStep
} from '../../shared/types'

// ── Propagation across resolvers (feature 2) ────────────────────────────────────

const PUBLIC_RESOLVERS: { label: string; value: string }[] = [
  { label: 'Cloudflare', value: '1.1.1.1' },
  { label: 'Google', value: '8.8.8.8' },
  { label: 'Quad9', value: '9.9.9.9' },
  { label: 'OpenDNS', value: '208.67.222.222' },
  { label: 'Cloudflare #2', value: '1.0.0.1' },
  { label: 'Google #2', value: '8.8.4.4' }
]

export async function checkPropagation(name: string, type: DnsRecordType): Promise<DnsPropagationResult> {
  const target = validateTarget(name)
  const queryName = isIP(target) && type === 'PTR' ? reverseName(target) : target

  const entries: DnsPropagationEntry[] = await Promise.all(
    PUBLIC_RESOLVERS.map(async (r) => {
      const res = await queryRaw(r.value, queryName, type, { doBit: false })
      return {
        resolver: r.value,
        label: r.label,
        values: res.records.map((rec) => rec.value).sort(),
        rcode: res.error ? null : res.rcodeName,
        error: res.error,
        rttMs: res.rttMs
      }
    })
  )

  // Consistent if every non-errored resolver returned the same value set.
  const sigs = entries
    .filter((e) => !e.error)
    .map((e) => e.values.join('|'))
  const consistent = sigs.length > 0 && sigs.every((s) => s === sigs[0])

  return { name: target, type, entries, consistent }
}

// ── Email security (feature 4) ───────────────────────────────────────────────────

// Common DKIM selectors to probe (no standard way to enumerate them).
const DKIM_SELECTORS = [
  'default', 'google', 'selector1', 'selector2', 'k1', 'k2',
  'dkim', 'mail', 's1', 's2', 'mandrill', 'mailjet', 'amazonses', 'zoho', 'fm1', 'fm2', 'fm3'
]

async function txtValues(resolver: string, name: string): Promise<string[]> {
  const res = await queryRaw(resolver, name, 'TXT', { doBit: false })
  return res.records.map((r) => r.value)
}

export async function checkEmailSecurity(domain: string, resolverIn: string): Promise<DnsEmailSecurity> {
  let target: string
  let resolver: string
  try {
    target = validateTarget(domain)
    resolver = pickResolver(resolverIn)
  } catch (err) {
    return {
      domain, spf: none(), dmarc: none(), mtaSts: none(), bimi: none(),
      dkim: [], dkimChecked: [], error: err instanceof Error ? err.message : String(err)
    }
  }

  const [spfTxt, dmarcTxt, mtaStsTxt, bimiTxt, dkimResults] = await Promise.all([
    txtValues(resolver, target),
    txtValues(resolver, `_dmarc.${target}`),
    txtValues(resolver, `_mta-sts.${target}`),
    txtValues(resolver, `default._bimi.${target}`),
    Promise.all(
      DKIM_SELECTORS.map(async (sel) => ({ sel, vals: await txtValues(resolver, `${sel}._domainkey.${target}`) }))
    )
  ])

  const spf = evalSpf(spfTxt)
  const dmarc = evalDmarc(dmarcTxt)
  const mtaSts = evalPrefixed(mtaStsTxt, 'v=STSv1', 'MTA-STS')
  const bimi = evalPrefixed(bimiTxt, 'v=BIMI1', 'BIMI')

  const dkim = dkimResults
    .map((d) => ({ selector: d.sel, value: d.vals.find((v) => /v=DKIM1|k=|p=/i.test(v)) ?? '' }))
    .filter((d) => d.value)

  return { domain: target, spf, dmarc, mtaSts, bimi, dkim, dkimChecked: DKIM_SELECTORS, error: null }
}

function none(): DnsEmailCheck {
  return { present: false, value: null, status: 'none', note: 'Not found' }
}

function evalSpf(txts: string[]): DnsEmailCheck {
  const spf = txts.filter((t) => /^v=spf1/i.test(t.trim()))
  if (spf.length === 0) return { present: false, value: null, status: 'fail', note: 'No SPF record — domain can be spoofed.' }
  if (spf.length > 1) return { present: true, value: spf.join(' | '), status: 'warn', note: 'Multiple SPF records — only one is allowed (RFC 7208).' }
  const v = spf[0]
  if (/[~?]all/i.test(v)) return { present: true, value: v, status: 'warn', note: '~all/?all is permissive (soft-fail/neutral). -all is stricter.' }
  if (/-all/i.test(v)) return { present: true, value: v, status: 'pass', note: 'Hard-fail (-all) — strict policy.' }
  if (/\+all/i.test(v)) return { present: true, value: v, status: 'fail', note: '+all allows anyone to send — effectively no protection.' }
  return { present: true, value: v, status: 'warn', note: 'SPF present but no explicit "all" mechanism.' }
}

function evalDmarc(txts: string[]): DnsEmailCheck {
  const dmarc = txts.find((t) => /^v=DMARC1/i.test(t.trim()))
  if (!dmarc) return { present: false, value: null, status: 'fail', note: 'No DMARC record — no policy for failing mail.' }
  const policy = /p=\s*(none|quarantine|reject)/i.exec(dmarc)?.[1]?.toLowerCase()
  if (policy === 'reject') return { present: true, value: dmarc, status: 'pass', note: 'Policy p=reject — strongest enforcement.' }
  if (policy === 'quarantine') return { present: true, value: dmarc, status: 'pass', note: 'Policy p=quarantine — failing mail is quarantined.' }
  if (policy === 'none') return { present: true, value: dmarc, status: 'warn', note: 'Policy p=none — monitoring only, no enforcement.' }
  return { present: true, value: dmarc, status: 'warn', note: 'DMARC present but policy unclear.' }
}

function evalPrefixed(txts: string[], prefix: string, label: string): DnsEmailCheck {
  const rec = txts.find((t) => t.trim().toLowerCase().startsWith(prefix.toLowerCase()))
  if (!rec) return { present: false, value: null, status: 'none', note: `No ${label} record.` }
  return { present: true, value: rec, status: 'pass', note: `${label} record present.` }
}

// ── Forward-confirmed reverse DNS / FCrDNS (feature 5) ──────────────────────────

export async function checkFcrdns(ips: string[], resolverIn: string): Promise<DnsFcrdnsResult> {
  let resolver: string
  try {
    resolver = pickResolver(resolverIn)
  } catch (err) {
    return { entries: [], error: err instanceof Error ? err.message : String(err) }
  }

  const unique = [...new Set(ips.filter((ip) => isIP(ip)))]
  const entries: DnsFcrdnsEntry[] = await Promise.all(
    unique.map(async (ip) => {
      const ptrRes = await queryRaw(resolver, reverseName(ip), 'PTR', { doBit: false })
      const ptr = ptrRes.records[0]?.value ?? null
      if (!ptr) return { ip, ptr: null, forwardIps: [], confirmed: false }
      // Forward-resolve the PTR name (A for v4, AAAA for v6) and confirm the IP.
      const fwdType = isIP(ip) === 6 ? 'AAAA' : 'A'
      const fwd = await queryRaw(resolver, ptr, fwdType, { doBit: false })
      const forwardIps = fwd.records.map((r) => r.value)
      return { ip, ptr, forwardIps, confirmed: forwardIps.includes(ip) }
    })
  )
  return { entries, error: null }
}

// ── Delegation trace / dig +trace (feature 6) ───────────────────────────────────

// A few root-server IPs (a/b/c/d/e/f-root). Iterative queries start here.
const ROOT_SERVERS = ['198.41.0.4', '199.9.14.201', '192.33.4.12', '199.7.91.13', '192.203.230.10', '192.5.5.241']
const MAX_STEPS = 12

export async function traceDelegation(name: string): Promise<DnsDelegationResult> {
  let target: string
  try {
    target = validateTarget(name)
  } catch (err) {
    return { name, steps: [], error: err instanceof Error ? err.message : String(err) }
  }

  const steps: DnsDelegationStep[] = []
  // Candidate servers for the current level: start at the roots.
  let servers: { ip: string; serverName: string | null }[] = ROOT_SERVERS.map((ip) => ({ ip, serverName: 'root' }))
  let zoneLabel = 'root (.)'

  for (let i = 0; i < MAX_STEPS; i++) {
    const server = servers[0]
    if (!server) break

    // Iterative query (rd=0): the server returns either an authoritative answer
    // or a referral (NS records in the authority section).
    const res = await queryRaw(server.ip, target, 'NS', { rd: false, doBit: false })
    const referralNs = res.authorityNs
    const answerNs = res.records.map((r) => r.value)
    const ns = answerNs.length > 0 ? answerNs : referralNs

    steps.push({
      zone: zoneLabel,
      serverQueried: server.ip,
      serverName: server.serverName,
      nsRecords: ns,
      authoritative: res.flags.aa || answerNs.length > 0,
      rttMs: res.rttMs,
      error: res.error
    })

    if (res.error) break
    // Reached the authoritative servers for the name.
    if (res.flags.aa || answerNs.length > 0) break
    if (referralNs.length === 0) break

    // Descend: pick next-level servers from glue, else resolve an NS name.
    const glue = res.additional.filter((a) => a.type === 'A')
    let next: { ip: string; serverName: string | null }[] = []
    if (glue.length > 0) {
      next = glue.map((g) => ({ ip: g.value, serverName: g.name }))
    } else {
      // No glue — resolve one NS name via a public resolver.
      const resolved = await queryRaw('1.1.1.1', referralNs[0], 'A', { rd: true })
      if (resolved.records[0]) next = [{ ip: resolved.records[0].value, serverName: referralNs[0] }]
    }
    if (next.length === 0) break
    servers = next
    zoneLabel = referralNs[0] ? `delegation for ${target}` : zoneLabel
  }

  return { name: target, steps, error: null }
}
