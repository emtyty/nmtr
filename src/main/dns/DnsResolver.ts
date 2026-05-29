/**
 * DNS Resolver — a dependency-free DNS client that resolves every record type
 * in a single scan, plus the low-level primitives the diagnostics layer builds on.
 *
 * Node's built-in `dns` module can't query DNSSEC records (DS, DNSKEY) or expose
 * wire-level flags (AA / AD), so this speaks the DNS protocol directly. Queries
 * run over TCP (RFC 1035 §4.2.2 — a 2-byte length prefix per message) to sidestep
 * UDP truncation; an EDNS0 OPT record with the DO bit advertises DNSSEC support.
 *
 * `queryRaw()` is the shared primitive: it returns the rcode, header flags, the
 * formatted answer records, the authority-section NS names, and additional-section
 * glue — everything the higher-level features (propagation, delegation trace,
 * authoritative lookups, DNSSEC status) need.
 */
import { connect, isIP } from 'net'
import { getServers } from 'dns'
import { randomBytes } from 'crypto'
import type {
  DnsLookupConfig,
  DnsLookupResult,
  DnsRecord,
  DnsRecordSet,
  DnsRecordType,
  DnssecInfo,
  DnssecStatus
} from '../../shared/types'
import { DNS_RECORD_TYPES } from '../../shared/types'

// ── Record-type ⇄ numeric code ─────────────────────────────────────────────────

export const TYPE_CODES: Record<DnsRecordType, number> = {
  A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15,
  TXT: 16, AAAA: 28, SRV: 33, DS: 43, DNSKEY: 48, CAA: 257
}
const CODE_TYPES: Record<number, DnsRecordType> = Object.fromEntries(
  Object.entries(TYPE_CODES).map(([t, c]) => [c, t as DnsRecordType])
) as Record<number, DnsRecordType>
const OPT_TYPE = 41

export const RCODES: Record<number, string> = {
  0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN',
  4: 'NOTIMP', 5: 'REFUSED', 9: 'NOTAUTH', 16: 'BADVERS'
}
export function rcodeName(code: number): string {
  return RCODES[code] ?? `RCODE${code}`
}

const DNSSEC_ALGOS: Record<number, string> = {
  1: 'RSAMD5', 5: 'RSASHA1', 7: 'RSASHA1-NSEC3-SHA1', 8: 'RSASHA256',
  10: 'RSASHA512', 13: 'ECDSAP256SHA256', 14: 'ECDSAP384SHA384',
  15: 'ED25519', 16: 'ED448'
}
const DS_DIGESTS: Record<number, string> = { 1: 'SHA-1', 2: 'SHA-256', 3: 'GOST', 4: 'SHA-384' }

// ── Input validation / normalisation ───────────────────────────────────────────

const HOST_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9.])?$/

export function validateTarget(target: string): string {
  const t = target.trim().replace(/\.$/, '')
  if (!t || (!isIP(t) && !HOST_RE.test(t))) {
    throw new Error('Invalid target. Enter a hostname or IP address.')
  }
  return t
}

/** Resolver to query: caller-supplied IP, else the first system resolver, else Cloudflare. */
export function pickResolver(resolver: string): string {
  const r = resolver.trim()
  if (r) {
    if (!isIP(r)) throw new Error('Invalid resolver. Enter an IP address (e.g. 1.1.1.1).')
    return r
  }
  const sys = getServers().find((s) => isIP(s.replace(/%.*$/, '')))
  return sys ? sys.replace(/%.*$/, '') : '1.1.1.1'
}

export function reverseName(ip: string): string {
  if (isIP(ip) === 4) return ip.split('.').reverse().join('.') + '.in-addr.arpa'
  const nibbles = expandIPv6(ip).replace(/:/g, '')
  return nibbles.split('').reverse().join('.') + '.ip6.arpa'
}

function expandIPv6(ip: string): string {
  const halves = ip.split('::')
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves[1] !== undefined ? (halves[1] ? halves[1].split(':') : []) : []
  const missing = 8 - head.length - tail.length
  const groups = [...head, ...Array(Math.max(0, missing)).fill('0'), ...tail]
  return groups.map((g) => g.padStart(4, '0')).join(':')
}

// ── Wire-format encoding ────────────────────────────────────────────────────────

function encodeName(name: string): Buffer {
  if (name === '' || name === '.') return Buffer.from([0])
  const parts = name.split('.').filter((p) => p.length > 0)
  const bufs = parts.map((label) => {
    const b = Buffer.from(label, 'utf8')
    return Buffer.concat([Buffer.from([b.length]), b])
  })
  return Buffer.concat([...bufs, Buffer.from([0])])
}

interface QueryOptions {
  rd?: boolean      // recursion desired (default true)
  cd?: boolean      // checking disabled — return data even if DNSSEC validation fails
  doBit?: boolean   // EDNS DO bit — request DNSSEC records (default true)
}

function buildQuery(id: number, name: string, qtype: number, opts: QueryOptions = {}): Buffer {
  const rd = opts.rd ?? true
  const cd = opts.cd ?? false
  const doBit = opts.doBit ?? true

  const header = Buffer.alloc(12)
  header.writeUInt16BE(id, 0)
  let flags = 0
  if (rd) flags |= 0x0100
  if (cd) flags |= 0x0010
  header.writeUInt16BE(flags, 2)
  header.writeUInt16BE(1, 4)   // QDCOUNT
  header.writeUInt16BE(1, 10)  // ARCOUNT (OPT)

  const qtail = Buffer.alloc(4)
  qtail.writeUInt16BE(qtype, 0)
  qtail.writeUInt16BE(1, 2)    // QCLASS IN
  const question = Buffer.concat([encodeName(name), qtail])

  const opt = Buffer.alloc(11)
  opt.writeUInt8(0, 0)               // root name
  opt.writeUInt16BE(OPT_TYPE, 1)
  opt.writeUInt16BE(4096, 3)         // UDP payload size
  opt.writeUInt8(0, 5)               // extended RCODE
  opt.writeUInt8(0, 6)               // EDNS version
  opt.writeUInt16BE(doBit ? 0x8000 : 0, 7)
  opt.writeUInt16BE(0, 9)            // RDLENGTH

  return Buffer.concat([header, question, opt])
}

// ── Wire-format parsing ──────────────────────────────────────────────────────────

interface NameRead { name: string; next: number }

function readName(buf: Buffer, offset: number): NameRead {
  const labels: string[] = []
  let pos = offset
  let next = -1
  let guard = 0
  while (guard++ < 128) {
    if (pos >= buf.length) break
    const len = buf[pos]
    if (len === 0) { if (next === -1) next = pos + 1; break }
    if ((len & 0xc0) === 0xc0) {
      if (next === -1) next = pos + 2
      pos = ((len & 0x3f) << 8) | buf[pos + 1]
      continue
    }
    labels.push(buf.slice(pos + 1, pos + 1 + len).toString('utf8'))
    pos += 1 + len
  }
  return { name: labels.join('.'), next: next === -1 ? pos : next }
}

function formatIPv4(b: Buffer): string {
  return `${b[0]}.${b[1]}.${b[2]}.${b[3]}`
}

function formatIPv6(b: Buffer): string {
  const groups: number[] = []
  for (let i = 0; i < 16; i += 2) groups.push((b[i] << 8) | b[i + 1])
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0
  for (let i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (curStart === -1) curStart = i
      curLen++
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
    } else { curStart = -1; curLen = 0 }
  }
  if (bestLen < 2) return groups.map((g) => g.toString(16)).join(':')
  const head = groups.slice(0, bestStart).map((g) => g.toString(16)).join(':')
  const tail = groups.slice(bestStart + bestLen).map((g) => g.toString(16)).join(':')
  return `${head}::${tail}`
}

type Section = 'an' | 'ns' | 'ar'
interface RawRR {
  name: string
  type: number
  ttl: number
  rdStart: number
  rdLength: number
  section: Section
}

export interface HeaderFlags {
  qr: boolean; aa: boolean; tc: boolean; rd: boolean; ra: boolean; ad: boolean; cd: boolean
}

interface ParsedResponse {
  rcode: number
  flags: HeaderFlags
  rrs: RawRR[]
}

function parseResponse(buf: Buffer): ParsedResponse {
  const f = buf.readUInt16BE(2)
  const flags: HeaderFlags = {
    qr: !!(f & 0x8000), aa: !!(f & 0x0400), tc: !!(f & 0x0200), rd: !!(f & 0x0100),
    ra: !!(f & 0x0080), ad: !!(f & 0x0020), cd: !!(f & 0x0010)
  }
  const rcode = f & 0x0f
  const qd = buf.readUInt16BE(4)
  const counts: [Section, number][] = [
    ['an', buf.readUInt16BE(6)],
    ['ns', buf.readUInt16BE(8)],
    ['ar', buf.readUInt16BE(10)]
  ]

  let pos = 12
  for (let i = 0; i < qd; i++) { pos = readName(buf, pos).next; pos += 4 }

  const rrs: RawRR[] = []
  for (const [section, count] of counts) {
    for (let i = 0; i < count; i++) {
      if (pos + 1 >= buf.length) break
      const nr = readName(buf, pos)
      pos = nr.next
      if (pos + 10 > buf.length) break
      const type = buf.readUInt16BE(pos)
      const ttl = buf.readUInt32BE(pos + 4)
      const rdLength = buf.readUInt16BE(pos + 8)
      const rdStart = pos + 10
      rrs.push({ name: nr.name, type, ttl, rdStart, rdLength, section })
      pos = rdStart + rdLength
    }
  }
  return { rcode, flags, rrs }
}

/** Format one RR into a typed DnsRecord, or null for unsupported/OPT records. */
function formatRR(buf: Buffer, a: RawRR): { type: DnsRecordType; record: DnsRecord } | null {
  const type = CODE_TYPES[a.type]
  if (!type) return null
  const rd = a.rdStart
  const end = a.rdStart + a.rdLength
  const base = { name: a.name || '.', ttl: a.ttl }
  let record: DnsRecord

  switch (a.type) {
    case TYPE_CODES.A:
      record = { ...base, value: formatIPv4(buf.slice(rd, rd + 4)), fields: {} }; break
    case TYPE_CODES.AAAA:
      record = { ...base, value: formatIPv6(buf.slice(rd, rd + 16)), fields: {} }; break
    case TYPE_CODES.NS:
    case TYPE_CODES.CNAME:
    case TYPE_CODES.PTR: {
      const target = readName(buf, rd).name
      record = { ...base, value: target, fields: { target } }; break
    }
    case TYPE_CODES.MX: {
      const preference = buf.readUInt16BE(rd)
      const exchange = readName(buf, rd + 2).name
      record = { ...base, value: `${preference} ${exchange}`, fields: { preference, exchange } }; break
    }
    case TYPE_CODES.TXT: {
      const parts: string[] = []
      let p = rd
      while (p < end) { const len = buf[p]; parts.push(buf.slice(p + 1, p + 1 + len).toString('utf8')); p += 1 + len }
      const text = parts.join('')
      record = { ...base, value: text, fields: { text } }; break
    }
    case TYPE_CODES.SOA: {
      const mnameR = readName(buf, rd)
      const rnameR = readName(buf, mnameR.next)
      const p = rnameR.next
      const serial = buf.readUInt32BE(p), refresh = buf.readUInt32BE(p + 4)
      const retry = buf.readUInt32BE(p + 8), expire = buf.readUInt32BE(p + 12), minimum = buf.readUInt32BE(p + 16)
      record = {
        ...base, value: `${mnameR.name} ${rnameR.name} ${serial} ${refresh} ${retry} ${expire} ${minimum}`,
        fields: { mname: mnameR.name, rname: rnameR.name, serial, refresh, retry, expire, minimum }
      }; break
    }
    case TYPE_CODES.SRV: {
      const priority = buf.readUInt16BE(rd), weight = buf.readUInt16BE(rd + 2), port = buf.readUInt16BE(rd + 4)
      const target = readName(buf, rd + 6).name
      record = { ...base, value: `${priority} ${weight} ${port} ${target}`, fields: { priority, weight, port, target } }; break
    }
    case TYPE_CODES.CAA: {
      const critical = buf[rd], tagLen = buf[rd + 1]
      const tag = buf.slice(rd + 2, rd + 2 + tagLen).toString('ascii')
      const val = buf.slice(rd + 2 + tagLen, end).toString('utf8')
      record = { ...base, value: `${critical} ${tag} "${val}"`, fields: { critical, tag, value: val } }; break
    }
    case TYPE_CODES.DS: {
      const keyTag = buf.readUInt16BE(rd), algorithm = buf[rd + 2], digestType = buf[rd + 3]
      const digest = buf.slice(rd + 4, end).toString('hex').toUpperCase()
      const algoName = DNSSEC_ALGOS[algorithm] ?? String(algorithm)
      const digName = DS_DIGESTS[digestType] ?? String(digestType)
      record = {
        ...base, value: `${keyTag} ${algoName} ${digName} ${digest}`,
        fields: { keyTag, algorithm, algorithmName: algoName, digestType, digestName: digName, digest }
      }; break
    }
    case TYPE_CODES.DNSKEY: {
      const flags = buf.readUInt16BE(rd), protocol = buf[rd + 2], algorithm = buf[rd + 3]
      const publicKey = buf.slice(rd + 4, end).toString('base64')
      const algoName = DNSSEC_ALGOS[algorithm] ?? String(algorithm)
      const role = flags === 257 ? 'KSK' : flags === 256 ? 'ZSK' : ''
      record = { ...base, value: `${flags} ${protocol} ${algoName} ${publicKey}`, fields: { flags, role, protocol, algorithm, algorithmName: algoName, publicKey } }; break
    }
    default:
      return null
  }
  return { type, record }
}

// ── TCP transport ──────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 6000

function sendTcp(resolver: string, query: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const framed = Buffer.alloc(2 + query.length)
    framed.writeUInt16BE(query.length, 0)
    query.copy(framed, 2)

    const socket = connect({ host: resolver, port: 53 })
    socket.setTimeout(QUERY_TIMEOUT_MS)
    const chunks: Buffer[] = []
    let expected = -1, received = 0
    const done = (err: Error | null, msg?: Buffer): void => {
      socket.destroy()
      if (err) reject(err); else resolve(msg!)
    }
    socket.on('connect', () => socket.write(framed))
    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk); received += chunk.length
      if (expected === -1 && received >= 2) expected = Buffer.concat(chunks).readUInt16BE(0)
      if (expected !== -1 && received >= expected + 2) done(null, Buffer.concat(chunks).slice(2, 2 + expected))
    })
    socket.on('timeout', () => done(new Error('Query timed out')))
    socket.on('error', (err) => done(err))
    socket.on('close', () => { if (expected === -1 || received < expected + 2) done(new Error('Connection closed before a full response')) })
  })
}

export interface RawQuery {
  rcode: number
  rcodeName: string
  flags: HeaderFlags
  records: DnsRecord[]                                 // answer-section RRs matching qtype
  authorityNs: string[]                                // NS names in the authority section
  additional: { name: string; type: DnsRecordType; value: string }[]  // glue (A/AAAA)
  rttMs: number
  error: string | null
}

/** The shared low-level query. Never throws — failures land in `error`. */
export async function queryRaw(
  resolver: string,
  name: string,
  type: DnsRecordType,
  opts: QueryOptions = {}
): Promise<RawQuery> {
  const startedAt = Date.now()
  try {
    const id = randomBytes(2).readUInt16BE(0)
    const buf = await sendTcp(resolver, buildQuery(id, name, TYPE_CODES[type], opts))
    const parsed = parseResponse(buf)
    const want = TYPE_CODES[type]
    const records: DnsRecord[] = []
    const authorityNs: string[] = []
    const additional: { name: string; type: DnsRecordType; value: string }[] = []
    for (const rr of parsed.rrs) {
      const f = formatRR(buf, rr)
      if (!f) continue
      if (rr.section === 'an' && rr.type === want) records.push(f.record)
      else if (rr.section === 'ns' && rr.type === TYPE_CODES.NS) authorityNs.push(f.record.value)
      else if (rr.section === 'ar' && (rr.type === TYPE_CODES.A || rr.type === TYPE_CODES.AAAA)) {
        additional.push({ name: f.record.name, type: f.type, value: f.record.value })
      }
    }
    return {
      rcode: parsed.rcode, rcodeName: rcodeName(parsed.rcode), flags: parsed.flags,
      records, authorityNs, additional, rttMs: Date.now() - startedAt, error: null
    }
  } catch (err) {
    return {
      rcode: -1, rcodeName: 'ERROR',
      flags: { qr: false, aa: false, tc: false, rd: false, ra: false, ad: false, cd: false },
      records: [], authorityNs: [], additional: [],
      rttMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err)
    }
  }
}

// ── DNSSEC status (feature 1) ────────────────────────────────────────────────────

async function computeDnssec(
  resolver: string,
  name: string,
  hasDnskey: boolean,
  hasDs: boolean
): Promise<DnssecInfo> {
  // A validating resolver sets AD=1 when the answer is DNSSEC-authenticated.
  const probe = await queryRaw(resolver, name, 'SOA', { doBit: true, cd: false })
  const adFlag = probe.flags.ad
  let status: DnssecStatus
  let detail: string

  if (probe.error) {
    status = 'indeterminate'
    detail = `Could not determine: ${probe.error}`
  } else if (probe.rcode === 2 /* SERVFAIL */) {
    // SERVFAIL from a validating resolver often means a broken chain. If the same
    // query with checking-disabled (CD) succeeds, the data exists but failed
    // validation → bogus.
    const cd = await queryRaw(resolver, name, 'SOA', { doBit: true, cd: true })
    if (cd.rcode === 0 && (hasDnskey || hasDs)) {
      status = 'bogus'
      detail = 'DNSSEC validation failed (SERVFAIL with validation, succeeds with CD) — broken chain of trust.'
    } else {
      status = 'indeterminate'
      detail = 'Resolver returned SERVFAIL; DNSSEC state could not be established.'
    }
  } else if (adFlag) {
    status = 'secure'
    detail = 'Resolver authenticated the response (AD bit set); the chain of trust validates.'
  } else if (hasDnskey || hasDs) {
    status = 'indeterminate'
    detail = 'Zone publishes DNSSEC records but the resolver did not set the AD bit (it may not validate, or the chain is incomplete).'
  } else {
    status = 'insecure'
    detail = 'No DNSSEC records published — the zone is unsigned.'
  }

  return { status, adFlag, hasDnskey, hasDs, detail }
}

// ── Authoritative server discovery (feature 3) ──────────────────────────────────

/** Find an authoritative NS IP for the zone of `name`, querying via `recursive`. */
export async function resolveAuthoritativeServer(recursive: string, name: string): Promise<string | null> {
  // Walk up the labels until we find NS records (handles sub.example.com → example.com).
  let labels = name.replace(/\.$/, '').split('.')
  let nsNames: string[] = []
  while (labels.length >= 2) {
    const zone = labels.join('.')
    const res = await queryRaw(recursive, zone, 'NS', { rd: true })
    if (res.records.length > 0) { nsNames = res.records.map((r) => r.value); break }
    labels = labels.slice(1)
  }
  if (nsNames.length === 0) return null
  // Resolve the first NS name to an IP.
  for (const ns of nsNames) {
    const a = await queryRaw(recursive, ns, 'A', { rd: true })
    if (a.records[0]) return a.records[0].value
  }
  return null
}

// ── Per-type resolution for the main scan ────────────────────────────────────────

async function resolveType(resolver: string, name: string, type: DnsRecordType): Promise<DnsRecordSet> {
  const res = await queryRaw(resolver, name, type, { doBit: true })
  return {
    type,
    records: res.records,
    rcode: res.error ? null : res.rcodeName,
    error: res.error
  }
}

/**
 * Resolve every record type for a target in one scan. When the target is an IP
 * literal, PTR queries its reverse-DNS name; other types query the literal. With
 * `authoritative`, answers are taken from the zone's authoritative NS.
 */
export async function resolveDns(config: DnsLookupConfig): Promise<DnsLookupResult> {
  const startedAt = Date.now()

  const emptyDnssec: DnssecInfo = { status: 'indeterminate', adFlag: false, hasDnskey: false, hasDs: false, detail: '' }

  let target: string
  let resolver: string
  try {
    target = validateTarget(config.target)
    resolver = pickResolver(config.resolver)
  } catch (err) {
    return {
      target: config.target, queriedName: config.target, resolver: config.resolver,
      authoritative: false, sets: [], dnssec: emptyDnssec, diff: null,
      durationMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err)
    }
  }

  const ipKind = isIP(target)
  const ptrName = ipKind ? reverseName(target) : target

  // Optionally redirect the scan to the zone's authoritative server.
  let queryResolver = resolver
  if (config.authoritative && !ipKind) {
    const auth = await resolveAuthoritativeServer(resolver, target)
    if (auth) queryResolver = auth
  }

  const sets = await Promise.all(
    DNS_RECORD_TYPES.map((type) => resolveType(queryResolver, type === 'PTR' ? ptrName : target, type))
  )

  const hasDnskey = (sets.find((s) => s.type === 'DNSKEY')?.records.length ?? 0) > 0
  const hasDs = (sets.find((s) => s.type === 'DS')?.records.length ?? 0) > 0
  const dnssec = ipKind
    ? emptyDnssec
    : await computeDnssec(queryResolver, target, hasDnskey, hasDs)

  // Authoritative flag: re-derive from an SOA query against the server actually used.
  const aaProbe = await queryRaw(queryResolver, ipKind ? ptrName : target, 'SOA', { rd: !config.authoritative })

  return {
    target,
    queriedName: ipKind ? ptrName : target,
    resolver: queryResolver,
    authoritative: aaProbe.flags.aa,
    sets,
    dnssec,
    diff: null, // filled in by the IPC handler from history
    durationMs: Date.now() - startedAt,
    error: null
  }
}
