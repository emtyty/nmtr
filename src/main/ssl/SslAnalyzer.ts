/**
 * SSL/TLS analyzer — a dependency-free TLS auditor built on Node's `tls`
 * module, modelled on the Qualys SSL Labs report.
 *
 * For a chosen host+IP endpoint it:
 *   1. opens a baseline connection to capture the certificate chain, the
 *      negotiated protocol/cipher, the trust verdict, and the hostname match;
 *   2. probes every protocol version (SSLv3 → TLS 1.3) one at a time to learn
 *      which the server enables;
 *   3. enumerates supported cipher suites per enabled protocol by offering one
 *      cipher at a time (a concurrency-limited pool of probe connections);
 *   4. grades the endpoint and collects human-readable issues.
 *
 * Like `DnsResolver`, it speaks the protocol directly rather than shelling out:
 * the only thing it can't get from Node's TLS API — the certificate signature
 * algorithm — is read with a tiny DER walk over the cert's raw bytes.
 *
 * Honesty about old protocols: modern Node/OpenSSL 3 builds drop SSLv3 and
 * often TLS 1.0/1.1, so forcing those versions fails *locally* rather than
 * reaching the server. We surface that as a distinct `untested` state instead
 * of falsely reporting the server doesn't support them.
 */
import * as tls from 'tls'
import * as https from 'https'
import { isIP } from 'net'
import type { PeerCertificate, DetailedPeerCertificate } from 'tls'
import type { BrowserWindow } from 'electron'
import { IPC } from '../ipc/channels'
import { SslStore } from '../store/SslStore'
import type {
  SslScanConfig,
  SslScanResult,
  SslCertificate,
  SslChainCert,
  TlsProtocol,
  TlsProtocolResult,
  TlsProtocolSupport,
  TlsCipher,
  CipherStrength,
  SslGrade,
  SslIssue,
  SslIssueSeverity,
  SslSecurityHeaders,
  SslOcsp,
  OcspStatus,
  SslScanProgressEvent,
  SslScanDoneEvent
} from '../../shared/types'

const CONNECT_TIMEOUT_MS = 8000
const CIPHER_CONCURRENCY = 8

// ── Cipher catalogue (OpenSSL name ⇄ IANA name) ──────────────────────────────

interface CipherDef {
  openssl: string
  iana: string
  bits: number
  fs: boolean
  strength: CipherStrength
  note: string | null
  legacy: boolean   // valid under TLS 1.0/1.1 (CBC/3DES/RC4) — skip GCM/SHA2 there
}

// TLS 1.2-and-below suites. Probed with @SECLEVEL=0 so the local library will
// still offer weaker (but compiled-in) suites where available.
const TLS12_CIPHERS: CipherDef[] = [
  // Strong: AEAD + forward secrecy
  { openssl: 'ECDHE-ECDSA-AES128-GCM-SHA256', iana: 'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256', bits: 128, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'ECDHE-RSA-AES128-GCM-SHA256', iana: 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256', bits: 128, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'ECDHE-ECDSA-AES256-GCM-SHA384', iana: 'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384', bits: 256, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'ECDHE-RSA-AES256-GCM-SHA384', iana: 'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384', bits: 256, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'ECDHE-ECDSA-CHACHA20-POLY1305', iana: 'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256', bits: 256, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'ECDHE-RSA-CHACHA20-POLY1305', iana: 'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256', bits: 256, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'DHE-RSA-AES128-GCM-SHA256', iana: 'TLS_DHE_RSA_WITH_AES_128_GCM_SHA256', bits: 128, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'DHE-RSA-AES256-GCM-SHA384', iana: 'TLS_DHE_RSA_WITH_AES_256_GCM_SHA384', bits: 256, fs: true, strength: 'strong', note: null, legacy: false },
  { openssl: 'DHE-RSA-CHACHA20-POLY1305', iana: 'TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256', bits: 256, fs: true, strength: 'strong', note: null, legacy: false },
  // Weak: CBC (even with FS), or AEAD without forward secrecy, or 3DES
  { openssl: 'ECDHE-RSA-AES128-SHA256', iana: 'TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256', bits: 128, fs: true, strength: 'weak', note: 'CBC mode', legacy: false },
  { openssl: 'ECDHE-RSA-AES256-SHA384', iana: 'TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384', bits: 256, fs: true, strength: 'weak', note: 'CBC mode', legacy: false },
  { openssl: 'ECDHE-RSA-AES128-SHA', iana: 'TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA', bits: 128, fs: true, strength: 'weak', note: 'CBC mode, SHA-1 MAC', legacy: true },
  { openssl: 'ECDHE-RSA-AES256-SHA', iana: 'TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA', bits: 256, fs: true, strength: 'weak', note: 'CBC mode, SHA-1 MAC', legacy: true },
  { openssl: 'ECDHE-ECDSA-AES128-SHA', iana: 'TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA', bits: 128, fs: true, strength: 'weak', note: 'CBC mode, SHA-1 MAC', legacy: true },
  { openssl: 'DHE-RSA-AES128-SHA', iana: 'TLS_DHE_RSA_WITH_AES_128_CBC_SHA', bits: 128, fs: true, strength: 'weak', note: 'CBC mode, SHA-1 MAC', legacy: true },
  { openssl: 'DHE-RSA-AES256-SHA', iana: 'TLS_DHE_RSA_WITH_AES_256_CBC_SHA', bits: 256, fs: true, strength: 'weak', note: 'CBC mode, SHA-1 MAC', legacy: true },
  { openssl: 'AES128-GCM-SHA256', iana: 'TLS_RSA_WITH_AES_128_GCM_SHA256', bits: 128, fs: false, strength: 'weak', note: 'no forward secrecy', legacy: false },
  { openssl: 'AES256-GCM-SHA384', iana: 'TLS_RSA_WITH_AES_256_GCM_SHA384', bits: 256, fs: false, strength: 'weak', note: 'no forward secrecy', legacy: false },
  { openssl: 'AES128-SHA256', iana: 'TLS_RSA_WITH_AES_128_CBC_SHA256', bits: 128, fs: false, strength: 'weak', note: 'no forward secrecy, CBC mode', legacy: false },
  { openssl: 'AES128-SHA', iana: 'TLS_RSA_WITH_AES_128_CBC_SHA', bits: 128, fs: false, strength: 'weak', note: 'no forward secrecy, CBC mode', legacy: true },
  { openssl: 'AES256-SHA', iana: 'TLS_RSA_WITH_AES_256_CBC_SHA', bits: 256, fs: false, strength: 'weak', note: 'no forward secrecy, CBC mode', legacy: true },
  { openssl: 'DES-CBC3-SHA', iana: 'TLS_RSA_WITH_3DES_EDE_CBC_SHA', bits: 112, fs: false, strength: 'weak', note: '3DES (Sweet32)', legacy: true },
  { openssl: 'ECDHE-RSA-DES-CBC3-SHA', iana: 'TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA', bits: 112, fs: true, strength: 'weak', note: '3DES (Sweet32)', legacy: true },
  // Insecure: RC4, export, anonymous, NULL, single-DES
  { openssl: 'ECDHE-RSA-RC4-SHA', iana: 'TLS_ECDHE_RSA_WITH_RC4_128_SHA', bits: 128, fs: true, strength: 'insecure', note: 'RC4 is broken', legacy: true },
  { openssl: 'RC4-SHA', iana: 'TLS_RSA_WITH_RC4_128_SHA', bits: 128, fs: false, strength: 'insecure', note: 'RC4 is broken', legacy: true },
  { openssl: 'RC4-MD5', iana: 'TLS_RSA_WITH_RC4_128_MD5', bits: 128, fs: false, strength: 'insecure', note: 'RC4 + MD5 are broken', legacy: true },
  { openssl: 'DES-CBC-SHA', iana: 'TLS_RSA_WITH_DES_CBC_SHA', bits: 56, fs: false, strength: 'insecure', note: '56-bit DES', legacy: true },
  { openssl: 'NULL-SHA', iana: 'TLS_RSA_WITH_NULL_SHA', bits: 0, fs: false, strength: 'insecure', note: 'no encryption', legacy: true },
  { openssl: 'ADH-AES128-SHA', iana: 'TLS_DH_anon_WITH_AES_128_CBC_SHA', bits: 128, fs: true, strength: 'insecure', note: 'anonymous — no authentication', legacy: true }
]

// TLS 1.3 suites (probed via the `ciphersuites` option). All AEAD + FS.
const TLS13_CIPHERS: { iana: string; bits: number }[] = [
  { iana: 'TLS_AES_128_GCM_SHA256', bits: 128 },
  { iana: 'TLS_AES_256_GCM_SHA384', bits: 256 },
  { iana: 'TLS_CHACHA20_POLY1305_SHA256', bits: 256 }
]

const PROTOCOLS: TlsProtocol[] = ['SSLv3', 'TLSv1.0', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3']

// ── Signature-algorithm DER extraction ──────────────────────────────────────

const SIG_OIDS: Record<string, string> = {
  '1.2.840.113549.1.1.4': 'MD5withRSA',
  '1.2.840.113549.1.1.5': 'SHA1withRSA',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.10045.4.1': 'SHA1withECDSA',
  '1.2.840.10045.4.3.2': 'SHA256withECDSA',
  '1.2.840.10045.4.3.3': 'SHA384withECDSA',
  '1.2.840.10045.4.3.4': 'SHA512withECDSA',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448'
}

interface Tlv { tag: number; contentStart: number; contentLen: number; end: number }

function readTlv(buf: Buffer, off: number): Tlv {
  const tag = buf[off]
  let len = buf[off + 1]
  let p = off + 2
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = (len << 8) | buf[p++]
  }
  return { tag, contentStart: p, contentLen: len, end: p + len }
}

function readOid(buf: Buffer, start: number, len: number): string {
  const bytes = buf.subarray(start, start + len)
  const first = bytes[0]
  const out: number[] = [Math.floor(first / 40), first % 40]
  let val = 0
  for (let i = 1; i < bytes.length; i++) {
    val = (val << 7) | (bytes[i] & 0x7f)
    if (!(bytes[i] & 0x80)) { out.push(val); val = 0 }
  }
  return out.join('.')
}

/** Walk Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, … } to the sig-alg OID. */
function extractSignatureAlgorithm(der: Buffer): string {
  try {
    const cert = readTlv(der, 0)                       // outer SEQUENCE
    const tbs = readTlv(der, cert.contentStart)         // tbsCertificate
    const sigAlg = readTlv(der, tbs.end)                // signatureAlgorithm SEQUENCE
    const oid = readTlv(der, sigAlg.contentStart)       // its OID
    const oidStr = readOid(der, oid.contentStart, oid.contentLen)
    return SIG_OIDS[oidStr] ?? oidStr
  } catch {
    return 'unknown'
  }
}

// ── OCSP staple parsing ──────────────────────────────────────────────────────
//
// The server may staple a DER-encoded OCSPResponse during the handshake. We walk
// it far enough to read the single cert's status (good / revoked / unknown) and,
// when revoked, the revocation time. Anything we can't parse degrades to 'unknown'
// rather than guessing.

/** Direct children of a constructed TLV, in order. */
function tlvChildren(buf: Buffer, parent: Tlv): Tlv[] {
  const out: Tlv[] = []
  let off = parent.contentStart
  while (off < parent.end && off < buf.length) {
    const t = readTlv(buf, off)
    out.push(t)
    if (t.end <= off) break  // malformed — avoid an infinite loop
    off = t.end
  }
  return out
}

/** ASN.1 GeneralizedTime ("YYYYMMDDHHMMSSZ") / UTCTime ("YYMMDDHHMMSSZ") → ISO. */
function parseAsn1Time(buf: Buffer, t: Tlv): string | null {
  const s = buf.subarray(t.contentStart, t.end).toString('ascii')
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/))) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`
  }
  if ((m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/))) {
    const yy = parseInt(m[1], 10)
    const year = yy >= 50 ? 1900 + yy : 2000 + yy
    return `${year}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`
  }
  return null
}

const OCSP_BASIC_OID = '1.3.6.1.5.5.7.48.1.1'

/**
 * Parse a stapled OCSPResponse buffer down to the leaf's revocation status.
 *   OCSPResponse ::= SEQUENCE { responseStatus ENUMERATED, responseBytes [0] ... }
 *   ResponseBytes ::= SEQUENCE { responseType OID, response OCTET STRING(BasicOCSPResponse) }
 *   BasicOCSPResponse ::= SEQUENCE { tbsResponseData ResponseData, ... }
 *   ResponseData ::= SEQUENCE { [version], responderID, producedAt, responses SEQUENCE OF SingleResponse, ... }
 *   SingleResponse ::= SEQUENCE { certID, certStatus CHOICE { [0] good, [1] revoked, [2] unknown }, ... }
 */
function parseStapledOcsp(der: Buffer): SslOcsp {
  const fallback = (detail: string): SslOcsp =>
    ({ stapled: true, status: 'unknown', revokedAt: null, producedAt: null, detail })
  try {
    const outer = readTlv(der, 0)                              // OCSPResponse SEQUENCE
    const kids = tlvChildren(der, outer)
    const respStatus = kids[0]                                 // ENUMERATED
    const statusByte = der[respStatus.contentStart]
    if (statusByte !== 0) return fallback(`OCSP responder status ${statusByte} (not "successful")`)

    const responseBytes = kids.find((k) => k.tag === 0xa0)     // [0] EXPLICIT
    if (!responseBytes) return fallback('No responseBytes in OCSP response')
    const rbSeq = readTlv(der, responseBytes.contentStart)     // ResponseBytes SEQUENCE
    const rbKids = tlvChildren(der, rbSeq)
    const typeOid = readOid(der, rbKids[0].contentStart, rbKids[0].contentLen)
    if (typeOid !== OCSP_BASIC_OID) return fallback(`Unsupported OCSP response type ${typeOid}`)

    const basic = readTlv(der, rbKids[1].contentStart)         // BasicOCSPResponse SEQUENCE (inside OCTET STRING)
    const tbs = tlvChildren(der, basic)[0]                     // ResponseData SEQUENCE
    const tbsKids = tlvChildren(der, tbs)

    // responses is the SEQUENCE OF that follows producedAt (GeneralizedTime, tag 0x18).
    let producedAt: string | null = null
    let responsesSeq: Tlv | null = null
    let sawProducedAt = false
    for (const k of tbsKids) {
      if (k.tag === 0x18) { producedAt = parseAsn1Time(der, k); sawProducedAt = true; continue }
      if (sawProducedAt && k.tag === 0x30) { responsesSeq = k; break }
    }
    if (!responsesSeq) return { stapled: true, status: 'unknown', revokedAt: null, producedAt, detail: 'No SingleResponse found' }

    const first = tlvChildren(der, responsesSeq)[0]            // first SingleResponse SEQUENCE
    const srKids = tlvChildren(der, first)                     // [0]=certID, [1]=certStatus
    const certStatus = srKids[1]
    // certStatus is context-tagged: [0] good, [1] revoked, [2] unknown.
    const choice = certStatus.tag & 0x1f
    if (choice === 0) return { stapled: true, status: 'good', revokedAt: null, producedAt, detail: null }
    if (choice === 2) return { stapled: true, status: 'unknown', revokedAt: null, producedAt, detail: 'Responder does not know this certificate' }
    if (choice === 1) {
      // RevokedInfo ::= SEQUENCE { revocationTime GeneralizedTime, ... }
      const revTime = tlvChildren(der, certStatus)[0]
      const revokedAt = revTime ? parseAsn1Time(der, revTime) : null
      return { stapled: true, status: 'revoked', revokedAt, producedAt, detail: 'Certificate has been revoked' }
    }
    return { stapled: true, status: 'unknown', revokedAt: null, producedAt, detail: null }
  } catch (err) {
    return fallback(`Could not parse OCSP response: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Connection primitive ─────────────────────────────────────────────────────

interface RunningScan { sockets: Set<tls.TLSSocket>; canceled: boolean }
const activeScans = new Map<string, RunningScan>()

interface ConnectOpts {
  protocol?: TlsProtocol     // pin min == max (or SSLv3 method)
  ciphers?: string           // TLS ≤1.2 single-cipher probe
  ciphersuites?: string      // TLS 1.3 single-suite probe
  wantCert?: boolean
  wantOcsp?: boolean         // request an OCSP staple during the handshake
}
interface ConnectOutcome {
  ok: boolean
  protocol: string | null
  cipherName: string | null
  cipherStd: string | null
  cipherBits: number | null
  peerCert: DetailedPeerCertificate | null
  authorized: boolean
  authorizationError: string | null
  ocspResponse: Buffer | null   // raw stapled OCSP response, when wantOcsp + server staples
  errorCode: string | null
  errorMessage: string | null
}

function versionArg(p: TlsProtocol): tls.SecureVersion {
  switch (p) {
    case 'TLSv1.0': return 'TLSv1'
    case 'TLSv1.1': return 'TLSv1.1'
    case 'TLSv1.3': return 'TLSv1.3'
    default: return 'TLSv1.2'
  }
}

function connectTls(
  ip: string,
  host: string,
  port: number,
  opts: ConnectOpts,
  scan: RunningScan
): Promise<ConnectOutcome> {
  return new Promise((resolve) => {
    const options: tls.ConnectionOptions = {
      host: ip,
      port,
      servername: isIP(host) ? undefined : host,  // SNI only for hostnames
      rejectUnauthorized: false                    // always capture cert + trust verdict
    }
    if (opts.protocol === 'SSLv3') {
      options.secureProtocol = 'SSLv3_method'
    } else if (opts.protocol) {
      const v = versionArg(opts.protocol)
      options.minVersion = v
      options.maxVersion = v
    }
    // Offer exactly the one cipher we're probing for. We deliberately do NOT use
    // OpenSSL's `@SECLEVEL=0` token here: Electron's Node is built against BoringSSL,
    // which rejects that syntax outright (making every probe fail). Plain cipher names
    // work in both BoringSSL and OpenSSL; a name the local library doesn't know simply
    // fails its own probe and is skipped.
    if (opts.ciphers) options.ciphers = opts.ciphers
    // `ciphersuites` is a valid Node option but absent from some @types/node builds.
    if (opts.ciphersuites) (options as tls.ConnectionOptions & { ciphersuites?: string }).ciphersuites = opts.ciphersuites
    // `requestOCSP` is a valid Node tls.connect option but absent from some @types/node builds.
    if (opts.wantOcsp) (options as tls.ConnectionOptions & { requestOCSP?: boolean }).requestOCSP = true

    let socket: tls.TLSSocket
    let settled = false
    // The 'OCSPResponse' event fires mid-handshake, before the secureConnect
    // callback — stash the staple so we can hand it back with the outcome.
    let ocspResponse: Buffer | null = null
    const finish = (o: Partial<ConnectOutcome>): void => {
      if (settled) return
      settled = true
      if (socket) {
        scan.sockets.delete(socket)
        try { socket.destroy() } catch { /* already gone */ }
      }
      resolve({
        ok: false, protocol: null, cipherName: null, cipherStd: null, cipherBits: null, peerCert: null,
        authorized: false, authorizationError: null, ocspResponse: null, errorCode: null, errorMessage: null, ...o
      })
    }

    try {
      socket = tls.connect(options, () => {
        const cipher = socket.getCipher() as (tls.CipherNameAndProtocol & { bits?: number }) | null
        finish({
          ok: true,
          protocol: socket.getProtocol(),
          cipherName: cipher?.name ?? null,
          cipherStd: (cipher as { standardName?: string } | null)?.standardName ?? null,
          cipherBits: cipher?.bits ?? null,
          peerCert: opts.wantCert ? socket.getPeerCertificate(true) : null,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
          ocspResponse
        })
      })
      if (opts.wantOcsp) socket.on('OCSPResponse', (resp: Buffer) => { ocspResponse = resp })
    } catch (err) {
      // Synchronous failures: unknown cipher/protocol not compiled into OpenSSL.
      const e = err as NodeJS.ErrnoException
      finish({ errorCode: e.code ?? 'ERR', errorMessage: e.message })
      return
    }

    scan.sockets.add(socket)
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish({ errorCode: 'ETIMEDOUT', errorMessage: 'Connection timed out' }))
    socket.on('error', (err: NodeJS.ErrnoException) => finish({ errorCode: err.code ?? 'ERR', errorMessage: err.message }))
    socket.on('close', () => finish({ errorCode: 'CLOSED', errorMessage: 'Connection closed before handshake' }))
  })
}

// ── HTTP security headers ─────────────────────────────────────────────────────

function parseHsts(raw: string | undefined): SslSecurityHeaders['hsts'] {
  if (!raw) return { present: false, maxAge: null, includeSubDomains: false, preload: false, raw: null }
  const maxAgeMatch = raw.match(/max-age\s*=\s*"?(\d+)"?/i)
  return {
    present: true,
    maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : null,
    includeSubDomains: /includeSubDomains/i.test(raw),
    preload: /preload/i.test(raw),
    raw
  }
}

function firstHeader(v: string | string[] | undefined): string | null {
  if (v === undefined) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Fetch HTTP security headers with a single HTTPS GET to the endpoint. Connects
 * by IP (with SNI/Host set to the real host) so it audits the same endpoint the
 * TLS scan did. Never throws — failures surface in `fetched: false` + `error`.
 */
function fetchSecurityHeaders(ip: string, host: string, port: number): Promise<SslSecurityHeaders> {
  return new Promise((resolve) => {
    const empty = (error: string | null): SslSecurityHeaders => ({
      fetched: false, statusCode: null,
      hsts: { present: false, maxAge: null, includeSubDomains: false, preload: false, raw: null },
      contentSecurityPolicy: false, xFrameOptions: null, xContentTypeOptions: false,
      referrerPolicy: null, server: null, error
    })
    let settled = false
    const done = (v: SslSecurityHeaders): void => { if (!settled) { settled = true; resolve(v) } }

    const req = https.request(
      {
        host: ip,
        port,
        servername: isIP(host) ? undefined : host,
        headers: { Host: host, 'User-Agent': 'nmtr-ssl-scan', Accept: '*/*', Connection: 'close' },
        method: 'GET',
        path: '/',
        rejectUnauthorized: false,
        timeout: CONNECT_TIMEOUT_MS
      },
      (res) => {
        const h = res.headers
        const hstsRaw = firstHeader(h['strict-transport-security'])
        done({
          fetched: true,
          statusCode: res.statusCode ?? null,
          hsts: parseHsts(hstsRaw ?? undefined),
          contentSecurityPolicy: h['content-security-policy'] !== undefined,
          xFrameOptions: firstHeader(h['x-frame-options']),
          xContentTypeOptions: /nosniff/i.test(firstHeader(h['x-content-type-options']) ?? ''),
          referrerPolicy: firstHeader(h['referrer-policy']),
          server: firstHeader(h.server),
          error: null
        })
        res.destroy()  // headers are all we need
      }
    )
    req.on('error', (e: Error) => done(empty(e.message)))
    req.on('timeout', () => { req.destroy(); done(empty('HTTP request timed out')) })
    req.end()
  })
}

// ── Classification helpers ────────────────────────────────────────────────────

const NETWORK_ERRORS = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'CLOSED'])

function classifyProtocol(o: ConnectOutcome): { support: TlsProtocolSupport; note: string | null } {
  if (o.ok) return { support: 'enabled', note: null }
  const code = o.errorCode ?? ''
  const msg = (o.errorMessage ?? '').toLowerCase()
  // The local TLS library can't even attempt this version.
  if (
    code === 'ERR_TLS_INVALID_PROTOCOL_VERSION' ||
    code === 'ERR_SSL_UNSUPPORTED_PROTOCOL' ||
    msg.includes('unsupported protocol') ||
    msg.includes('methods disabled') ||
    msg.includes('no protocols available') ||
    msg.includes('no ciphers available') ||
    msg.includes('library has no ciphers') ||
    msg.includes('no cipher match') ||
    msg.includes('unsupported')
  ) {
    return { support: 'untested', note: 'Local TLS library cannot test this version' }
  }
  if (NETWORK_ERRORS.has(code)) {
    return { support: 'untested', note: 'No response for this version' }
  }
  // A handshake-level rejection means the server doesn't offer it.
  return { support: 'disabled', note: null }
}

function normaliseProtocol(p: string | null): TlsProtocol | null {
  switch (p) {
    case 'TLSv1.3': return 'TLSv1.3'
    case 'TLSv1.2': return 'TLSv1.2'
    case 'TLSv1.1': return 'TLSv1.1'
    case 'TLSv1': return 'TLSv1.0'
    case 'SSLv3': return 'SSLv3'
    default: return null
  }
}

// ── Certificate parsing ────────────────────────────────────────────────────────

function nameString(name: PeerCertificate['subject'] | undefined): string {
  if (!name) return ''
  if (typeof name === 'string') return name
  const fields = name as Record<string, string | string[]>
  const flat = (v: string | string[]): string => (Array.isArray(v) ? v.join('/') : v)
  if (fields.CN) return flat(fields.CN)
  return Object.entries(fields).map(([k, v]) => `${k}=${flat(v)}`).join(', ')
}

function keyTypeOf(cert: PeerCertificate): string {
  if (cert.asn1Curve || cert.nistCurve) return 'EC'
  if (cert.modulus || cert.exponent) return 'RSA'
  return 'RSA'
}

function toIso(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

function parseLeaf(cert: DetailedPeerCertificate): SslCertificate {
  const validFrom = toIso(cert.valid_from)
  const validTo = toIso(cert.valid_to)
  const now = Date.now()
  const toMs = validTo ? new Date(validTo).getTime() : 0
  const fromMs = validFrom ? new Date(validFrom).getTime() : 0
  const sans = (cert.subjectaltname ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^DNS:/i, ''))
    .filter(Boolean)
  const subject = nameString(cert.subject)
  const issuer = nameString(cert.issuer)
  return {
    subject,
    subjectAltNames: sans,
    issuer,
    serialNumber: cert.serialNumber ?? '',
    validFrom,
    validTo,
    daysRemaining: toMs ? Math.floor((toMs - now) / 86_400_000) : 0,
    expired: toMs ? now > toMs : false,
    notYetValid: fromMs ? now < fromMs : false,
    keyType: keyTypeOf(cert),
    keyBits: cert.bits ?? null,
    signatureAlgorithm: cert.raw ? extractSignatureAlgorithm(cert.raw) : 'unknown',
    sha256Fingerprint: cert.fingerprint256 ?? '',
    sha1Fingerprint: cert.fingerprint ?? '',
    isCa: Boolean((cert as unknown as { ca?: boolean }).ca),
    selfSigned: subject !== '' && subject === issuer
  }
}

function buildChain(leaf: DetailedPeerCertificate): SslChainCert[] {
  const chain: SslChainCert[] = []
  const seen = new Set<string>()
  let cur: DetailedPeerCertificate | undefined = leaf
  while (cur && cur.raw) {
    const fp = cur.fingerprint256 ?? cur.serialNumber ?? String(chain.length)
    if (seen.has(fp)) break
    seen.add(fp)
    const validTo = toIso(cur.valid_to)
    chain.push({
      subject: nameString(cur.subject),
      issuer: nameString(cur.issuer),
      keyType: keyTypeOf(cur),
      keyBits: cur.bits ?? null,
      signatureAlgorithm: extractSignatureAlgorithm(cur.raw),
      validTo,
      expired: validTo ? Date.now() > new Date(validTo).getTime() : false
    })
    const next: DetailedPeerCertificate | undefined = cur.issuerCertificate
    // The root self-references its own issuerCertificate — stop there.
    if (!next || next === cur) break
    cur = next
  }
  return chain
}

// ── Grading ───────────────────────────────────────────────────────────────────

const GRADE_RANK: Record<SslGrade, number> = { 'A+': 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1, T: 0, M: 0 }
function worse(a: SslGrade, b: SslGrade): SslGrade {
  return GRADE_RANK[a] <= GRADE_RANK[b] ? a : b
}

interface GradeInput {
  certificate: SslCertificate | null
  hostnameMatch: boolean
  chainTrusted: boolean
  protocols: TlsProtocolResult[]
  ciphers: TlsCipher[]
  securityHeaders: SslSecurityHeaders | null
  ocsp: SslOcsp | null
}

/** HSTS counts only when present with a non-trivial max-age (≥ 1 day). */
function hasStrongHsts(h: SslSecurityHeaders | null): boolean {
  return Boolean(h?.hsts.present && (h.hsts.maxAge ?? 0) >= 86_400)
}

function weakKey(c: SslCertificate): boolean {
  if (c.keyType === 'RSA') return (c.keyBits ?? 0) < 2048
  if (c.keyType === 'EC') return (c.keyBits ?? 0) < 256
  return false
}

function computeGrade(r: GradeInput): SslGrade {
  if (!r.certificate) return 'F'
  if (!r.hostnameMatch) return 'M'
  if (r.certificate.expired || r.certificate.notYetValid || r.certificate.selfSigned || !r.chainTrusted) return 'T'
  // A confirmed revocation is a trust failure, just like an untrusted chain.
  if (r.ocsp?.status === 'revoked') return 'T'

  const enabled = new Set(r.protocols.filter((p) => p.support === 'enabled').map((p) => p.protocol))
  const hasInsecureCipher = r.ciphers.some((c) => c.strength === 'insecure')
  if (enabled.has('SSLv3') || hasInsecureCipher || weakKey(r.certificate)) return 'F'

  let grade: SslGrade = 'A'
  const hasWeakCipher = r.ciphers.some((c) => c.strength === 'weak')
  const noFs = r.ciphers.some((c) => !c.forwardSecrecy)
  if (enabled.has('TLSv1.0') || enabled.has('TLSv1.1')) grade = worse(grade, 'B')
  if (hasWeakCipher || noFs) grade = worse(grade, 'B')
  if (/sha1|md5/i.test(r.certificate.signatureAlgorithm)) grade = worse(grade, 'C')

  // A+ also requires HSTS, mirroring SSL Labs (HSTS is the gate from A to A+).
  if (
    grade === 'A' &&
    hasStrongHsts(r.securityHeaders) &&
    enabled.has('TLSv1.3') &&
    !enabled.has('SSLv3') && !enabled.has('TLSv1.0') && !enabled.has('TLSv1.1') &&
    r.ciphers.length > 0 && r.ciphers.every((c) => c.strength === 'strong' && c.forwardSecrecy)
  ) {
    return 'A+'
  }
  return grade
}

function collectIssues(r: GradeInput): SslIssue[] {
  const issues: SslIssue[] = []
  const add = (severity: SslIssueSeverity, title: string, detail: string): void => { issues.push({ severity, title, detail }) }
  const c = r.certificate
  if (!c) {
    add('critical', 'No certificate', 'The server did not present a certificate.')
    return issues
  }
  if (!r.hostnameMatch) add('critical', 'Hostname mismatch', `The certificate is not valid for this hostname (CN/SAN does not match).`)
  if (c.expired) add('critical', 'Certificate expired', `Expired on ${c.validTo}.`)
  if (c.notYetValid) add('critical', 'Certificate not yet valid', `Not valid until ${c.validFrom}.`)
  if (c.selfSigned) add('high', 'Self-signed certificate', 'The certificate is self-signed and not anchored to a trusted CA.')
  if (!r.chainTrusted && !c.selfSigned) add('high', 'Chain not trusted', 'The certificate chain could not be validated against the system trust store.')
  if (weakKey(c)) add('critical', 'Weak key', `${c.keyType} key of ${c.keyBits ?? '?'} bits is below the recommended minimum.`)
  else if (!c.expired && c.daysRemaining <= 21 && c.daysRemaining >= 0) add('medium', 'Certificate expiring soon', `Expires in ${c.daysRemaining} day(s).`)
  if (/sha1|md5/i.test(c.signatureAlgorithm)) add('high', 'Weak signature', `Certificate signed with ${c.signatureAlgorithm}.`)

  const enabled = r.protocols.filter((p) => p.support === 'enabled').map((p) => p.protocol)
  if (enabled.includes('SSLv3')) add('critical', 'SSL 3.0 enabled', 'SSLv3 is obsolete and vulnerable (POODLE).')
  if (enabled.includes('TLSv1.0')) add('medium', 'TLS 1.0 enabled', 'TLS 1.0 is deprecated and should be disabled.')
  if (enabled.includes('TLSv1.1')) add('medium', 'TLS 1.1 enabled', 'TLS 1.1 is deprecated and should be disabled.')
  if (!enabled.includes('TLSv1.2') && !enabled.includes('TLSv1.3')) add('high', 'No modern TLS', 'Neither TLS 1.2 nor TLS 1.3 is enabled.')
  if (!enabled.includes('TLSv1.3')) add('low', 'TLS 1.3 not enabled', 'Enabling TLS 1.3 improves security and performance.')

  for (const cip of r.ciphers.filter((x) => x.strength === 'insecure')) add('critical', `Insecure cipher: ${cip.name}`, cip.note ?? 'This cipher suite is insecure.')
  for (const cip of r.ciphers.filter((x) => x.strength === 'weak')) add('medium', `Weak cipher: ${cip.name}`, cip.note ?? 'This cipher suite is weak.')
  if (r.ciphers.some((x) => !x.forwardSecrecy)) add('medium', 'No forward secrecy', 'One or more cipher suites do not provide forward secrecy.')

  // OCSP revocation (from the stapled response, when present).
  if (r.ocsp?.status === 'revoked') {
    add('critical', 'Certificate revoked', r.ocsp.revokedAt ? `Revoked on ${r.ocsp.revokedAt} per the stapled OCSP response.` : 'The stapled OCSP response reports this certificate as revoked.')
  } else if (r.ocsp?.status === 'unknown' && r.ocsp.stapled) {
    add('low', 'OCSP status unknown', r.ocsp.detail ?? 'The stapled OCSP response did not confirm the certificate status.')
  }

  // HTTP security headers (only when we actually reached the HTTP layer).
  if (r.securityHeaders?.fetched) {
    const sh = r.securityHeaders
    if (!sh.hsts.present) add('low', 'No HSTS', 'No Strict-Transport-Security header — clients may connect over plaintext HTTP first.')
    else if ((sh.hsts.maxAge ?? 0) < 86_400) add('low', 'Weak HSTS max-age', `Strict-Transport-Security max-age is only ${sh.hsts.maxAge ?? 0}s; 1 year (31536000) is recommended.`)
    if (!sh.xContentTypeOptions) add('info', 'No X-Content-Type-Options', 'Missing "X-Content-Type-Options: nosniff" header.')
    if (!sh.contentSecurityPolicy) add('info', 'No Content-Security-Policy', 'No Content-Security-Policy header was sent.')
  }

  return issues
}

// ── Concurrency pool ────────────────────────────────────────────────────────────

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

// ── Progress emit ────────────────────────────────────────────────────────────

function emitProgress(win: BrowserWindow, payload: SslScanProgressEvent): void {
  if (!win.isDestroyed()) win.webContents.send(IPC.SSL_PROGRESS, payload)
}
function emitDone(win: BrowserWindow, payload: SslScanDoneEvent): void {
  if (!win.isDestroyed()) win.webContents.send(IPC.SSL_DONE, payload)
}

// ── Orchestrator ────────────────────────────────────────────────────────────────

/**
 * Run a full SSL/TLS analysis against host+ip:port. Resolves once complete;
 * progress streams via SSL_PROGRESS and the result lands via SSL_DONE.
 */
export async function startSslScan(scanId: string, config: SslScanConfig, win: BrowserWindow): Promise<void> {
  const startedAt = Date.now()
  const { host, ip, port } = config
  const scan: RunningScan = { sockets: new Set(), canceled: false }
  activeScans.set(scanId, scan)

  const fail = (error: string): void => {
    activeScans.delete(scanId)
    emitDone(win, {
      scanId,
      result: {
        scanId, host, ip, port, grade: 'F', hostnameMatch: false, chainTrusted: false,
        trustError: error, certificate: null, chain: [], protocols: [], ciphers: [],
        negotiatedProtocol: null, negotiatedCipher: null, securityHeaders: null, ocsp: null,
        issues: [], diff: null, startedAt, durationMs: Date.now() - startedAt, error
      }
    })
  }

  try {
    // 1. Baseline connection — captures cert chain, trust, negotiated suite, and OCSP staple.
    emitProgress(win, { scanId, percent: 2, message: `Connecting to ${ip}:${port}…` })
    const baseline = await connectTls(ip, host, port, { wantCert: true, wantOcsp: true }, scan)
    if (scan.canceled) return fail('Scan canceled.')
    if (!baseline.ok || !baseline.peerCert || !baseline.peerCert.raw) {
      return fail(baseline.errorMessage ?? `Could not establish a TLS connection to ${ip}:${port}.`)
    }

    const certificate = parseLeaf(baseline.peerCert)
    const chain = buildChain(baseline.peerCert)
    const chainTrusted = baseline.authorized
    let hostnameMatch = true
    try {
      hostnameMatch = tls.checkServerIdentity(host, baseline.peerCert) === undefined
    } catch {
      hostnameMatch = false
    }
    const negotiatedProtocol = normaliseProtocol(baseline.protocol)
    const negotiatedCipher = baseline.cipherName
    const ocsp: SslOcsp = baseline.ocspResponse
      ? parseStapledOcsp(baseline.ocspResponse)
      : { stapled: false, status: 'not-stapled', revokedAt: null, producedAt: null, detail: 'The server did not staple an OCSP response.' }

    // 1b. HTTP security headers (HSTS etc.) — independent of the TLS probes below.
    emitProgress(win, { scanId, percent: 6, message: 'Fetching HTTP security headers…' })
    const headersPromise = fetchSecurityHeaders(ip, host, port)

    // 2. Protocol probing.
    const protocols: TlsProtocolResult[] = []
    for (let i = 0; i < PROTOCOLS.length; i++) {
      if (scan.canceled) return fail('Scan canceled.')
      const proto = PROTOCOLS[i]
      emitProgress(win, { scanId, percent: 10 + i * 6, message: `Testing ${proto}…` })
      const outcome = await connectTls(ip, host, port, { protocol: proto }, scan)
      const { support, note } = classifyProtocol(outcome)
      protocols.push({ protocol: proto, support, note })
    }

    // 3. Cipher enumeration over the enabled protocols.
    const enabledLegacy = protocols
      .filter((p) => p.support === 'enabled' && (p.protocol === 'TLSv1.0' || p.protocol === 'TLSv1.1' || p.protocol === 'TLSv1.2'))
      .map((p) => p.protocol)
    const tls13Enabled = protocols.some((p) => p.protocol === 'TLSv1.3' && p.support === 'enabled')

    interface Probe { proto: TlsProtocol; def?: CipherDef; suite?: { iana: string; bits: number } }
    const probes: Probe[] = []
    for (const proto of enabledLegacy) {
      for (const def of TLS12_CIPHERS) {
        // TLS 1.0/1.1 only carry legacy (CBC/3DES/RC4) suites.
        if ((proto === 'TLSv1.0' || proto === 'TLSv1.1') && !def.legacy) continue
        probes.push({ proto, def })
      }
    }
    if (tls13Enabled) for (const suite of TLS13_CIPHERS) probes.push({ proto: 'TLSv1.3', suite })

    const ciphers: TlsCipher[] = []
    let done = 0
    await runPool(probes, CIPHER_CONCURRENCY, async (probe) => {
      if (scan.canceled) return
      let outcome: ConnectOutcome
      if (probe.suite) {
        outcome = await connectTls(ip, host, port, { protocol: 'TLSv1.3', ciphersuites: probe.suite.iana }, scan)
      } else {
        outcome = await connectTls(ip, host, port, { protocol: probe.proto, ciphers: probe.def!.openssl }, scan)
      }
      done++
      emitProgress(win, { scanId, percent: 40 + Math.round((done / probes.length) * 55), message: `Enumerating ${probe.proto} ciphers (${done}/${probes.length})` })
      if (!outcome.ok) return
      if (probe.suite) {
        // Only record the suite if it was the one actually negotiated — guards against
        // a TLS library that ignores the `ciphersuites` restriction (which would
        // otherwise mark every offered suite as "supported").
        const negotiated = outcome.cipherName ?? outcome.cipherStd
        if (negotiated !== probe.suite.iana) return
        ciphers.push({
          name: probe.suite.iana, opensslName: probe.suite.iana, protocol: 'TLSv1.3',
          bits: outcome.cipherBits ?? probe.suite.bits, forwardSecrecy: true, strength: 'strong', note: null
        })
      } else {
        const d = probe.def!
        ciphers.push({
          name: d.iana, opensslName: d.openssl, protocol: probe.proto,
          bits: outcome.cipherBits ?? d.bits, forwardSecrecy: d.fs, strength: d.strength, note: d.note
        })
      }
    })
    if (scan.canceled) return fail('Scan canceled.')

    // 4. Grade + issues.
    const securityHeaders = await headersPromise
    const gradeInput: GradeInput = { certificate, hostnameMatch, chainTrusted, protocols, ciphers, securityHeaders, ocsp }
    const grade = computeGrade(gradeInput)
    const issues = collectIssues(gradeInput)

    const result: SslScanResult = {
      scanId, host, ip, port, grade, hostnameMatch, chainTrusted,
      trustError: chainTrusted ? null : baseline.authorizationError,
      certificate, chain, protocols, ciphers, negotiatedProtocol, negotiatedCipher,
      securityHeaders, ocsp,
      issues, diff: null, startedAt, durationMs: Date.now() - startedAt, error: null
    }

    // Diff vs the previous scan of this endpoint, then persist.
    try { result.diff = SslStore.commit(result) } catch { result.diff = null }

    activeScans.delete(scanId)
    emitProgress(win, { scanId, percent: 100, message: 'Done' })
    emitDone(win, { scanId, result })
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
}

/** Cancel a running scan, destroying all in-flight probe sockets. */
export function cancelSslScan(scanId: string): void {
  const scan = activeScans.get(scanId)
  if (!scan) return
  scan.canceled = true
  for (const socket of scan.sockets) {
    try { socket.destroy() } catch { /* ignore */ }
  }
}
