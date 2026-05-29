import {
  ShieldCheck, ShieldAlert, Clock, Key, FileSignature, Fingerprint, Link2,
  ArrowUpRight, RefreshCw, AlertTriangle
} from 'lucide-react'
import type {
  SslScanResult,
  SslCertificate,
  SslChainCert,
  TlsProtocolResult,
  TlsCipher,
  SslIssue,
  SslIssueSeverity,
  SslGrade,
  SslDiff
} from '@shared/types'

// ── Grade badge ────────────────────────────────────────────────────────────

const GRADE_STYLE: Record<SslGrade, { bg: string; fg: string }> = {
  'A+': { bg: '#3fb950', fg: '#04130a' },
  A: { bg: '#3fb950', fg: '#04130a' },
  B: { bg: '#d29922', fg: '#1a1200' },
  C: { bg: '#d29922', fg: '#1a1200' },
  D: { bg: '#f0883e', fg: '#1a0d00' },
  E: { bg: '#f0883e', fg: '#1a0d00' },
  F: { bg: '#f85149', fg: '#1a0202' },
  T: { bg: '#f85149', fg: '#1a0202' },
  M: { bg: '#f85149', fg: '#1a0202' }
}

const GRADE_CAPTION: Partial<Record<SslGrade, string>> = {
  T: 'Trust issue',
  M: 'Hostname mismatch'
}

export function GradeBadge({ grade, size = 'lg' }: { grade: SslGrade; size?: 'sm' | 'lg' }): React.JSX.Element {
  const s = GRADE_STYLE[grade]
  const dim = size === 'lg' ? 'w-16 h-16 text-3xl rounded-xl' : 'w-9 h-9 text-base rounded-lg'
  return (
    <span className={`inline-flex items-center justify-center font-extrabold ${dim}`} style={{ background: s.bg, color: s.fg }}
      title={GRADE_CAPTION[grade]}>
      {grade}
    </span>
  )
}

// ── Certificate card ─────────────────────────────────────────────────────────

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex gap-3 px-3 py-2 border-b border-border-muted/40 last:border-0">
      <span className="flex items-center gap-1.5 text-fg-subtle w-32 shrink-0 text-[12px]">{icon}{label}</span>
      <span className="flex-1 text-fg-default font-mono text-[13px] break-all">{children}</span>
    </div>
  )
}

export function CertificateCard({ cert }: { cert: SslCertificate }): React.JSX.Element {
  const expiryColor = cert.expired
    ? 'text-accent-red'
    : cert.daysRemaining <= 21 ? 'text-accent-yellow' : 'text-accent-green'
  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-canvas-inset">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle">
        <FileSignature className="w-4 h-4 text-accent-blue" />
        <span className="text-[13px] font-semibold text-fg-default">Certificate</span>
        {cert.selfSigned && (
          <span className="ml-auto px-1.5 py-0.5 rounded text-[11px] font-semibold bg-accent-red/15 text-accent-red">self-signed</span>
        )}
      </div>
      <Row icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Subject">{cert.subject || '—'}</Row>
      {cert.subjectAltNames.length > 0 && (
        <Row icon={<Link2 className="w-3.5 h-3.5" />} label="Alt names">
          <span className="flex flex-wrap gap-1">
            {cert.subjectAltNames.map((s) => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-canvas-overlay text-fg-muted text-[12px]">{s}</span>
            ))}
          </span>
        </Row>
      )}
      <Row icon={<FileSignature className="w-3.5 h-3.5" />} label="Issuer">{cert.issuer || '—'}</Row>
      <Row icon={<Clock className="w-3.5 h-3.5" />} label="Validity">
        <span className="text-fg-muted">{fmtDate(cert.validFrom)} → {fmtDate(cert.validTo)}</span>{' '}
        <span className={expiryColor}>
          ({cert.expired ? 'expired' : cert.notYetValid ? 'not yet valid' : `${cert.daysRemaining} days left`})
        </span>
      </Row>
      <Row icon={<Key className="w-3.5 h-3.5" />} label="Public key">{cert.keyType} {cert.keyBits ? `${cert.keyBits} bits` : ''}</Row>
      <Row icon={<FileSignature className="w-3.5 h-3.5" />} label="Signature">{cert.signatureAlgorithm}</Row>
      <Row icon={<Fingerprint className="w-3.5 h-3.5" />} label="SHA-256">{cert.sha256Fingerprint || '—'}</Row>
    </div>
  )
}

// ── Chain ──────────────────────────────────────────────────────────────────────

export function ChainList({ chain }: { chain: SslChainCert[] }): React.JSX.Element | null {
  if (chain.length === 0) return null
  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-canvas-inset">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle">
        <Link2 className="w-4 h-4 text-accent-blue" />
        <span className="text-[13px] font-semibold text-fg-default">Certificate chain</span>
        <span className="text-[12px] font-mono text-fg-subtle">{chain.length}</span>
      </div>
      <ol>
        {chain.map((c, i) => (
          <li key={i} className="px-3 py-2 border-b border-border-muted/40 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-fg-subtle">{i + 1}</span>
              <span className="text-[13px] font-mono text-fg-default break-all">{c.subject || '—'}</span>
              {c.expired && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-red/15 text-accent-red">expired</span>}
            </div>
            <div className="ml-5 text-[12px] text-fg-subtle font-mono">
              {c.keyType}{c.keyBits ? ` ${c.keyBits}` : ''} · {c.signatureAlgorithm} · issued by {c.issuer || '—'}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── Protocol table ───────────────────────────────────────────────────────────

const PROTO_STYLE: Record<TlsProtocolResult['support'], { label: string; cls: string }> = {
  enabled: { label: 'Enabled', cls: 'text-accent-green' },
  disabled: { label: 'Disabled', cls: 'text-fg-subtle' },
  untested: { label: 'Untested', cls: 'text-accent-yellow' }
}

export function ProtocolTable({ protocols }: { protocols: TlsProtocolResult[] }): React.JSX.Element {
  // Old protocols enabled are a problem; new ones enabled are good.
  const bad = new Set(['SSLv3', 'TLSv1.0', 'TLSv1.1'])
  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-canvas-inset">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle">
        <span className="text-[13px] font-semibold text-fg-default">Protocols</span>
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          {protocols.map((p) => {
            const st = PROTO_STYLE[p.support]
            const enabledBad = p.support === 'enabled' && bad.has(p.protocol)
            return (
              <tr key={p.protocol} className="border-b border-border-muted/40 last:border-0">
                <td className="px-3 py-1.5 font-mono text-fg-default w-28">{p.protocol}</td>
                <td className={`px-3 py-1.5 font-semibold ${enabledBad ? 'text-accent-yellow' : st.cls}`}>{st.label}</td>
                <td className="px-3 py-1.5 text-[12px] text-fg-subtle">{p.note ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Cipher list ────────────────────────────────────────────────────────────────

const STRENGTH_COLOR: Record<TlsCipher['strength'], string> = {
  strong: '#3fb950',
  weak: '#d29922',
  insecure: '#f85149'
}

export function CipherList({ ciphers }: { ciphers: TlsCipher[] }): React.JSX.Element {
  // Group by protocol, in descending protocol order.
  const order = ['TLSv1.3', 'TLSv1.2', 'TLSv1.1', 'TLSv1.0', 'SSLv3']
  const groups = order
    .map((proto) => ({ proto, list: ciphers.filter((c) => c.protocol === proto) }))
    .filter((g) => g.list.length > 0)

  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-canvas-inset">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle">
        <span className="text-[13px] font-semibold text-fg-default">Cipher suites</span>
        <span className="text-[12px] font-mono text-fg-subtle">{ciphers.length}</span>
      </div>
      {groups.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-fg-subtle">No cipher suites detected.</p>
      ) : groups.map((g) => (
        <div key={g.proto}>
          <div className="px-3 py-1 bg-canvas-subtle/60 text-[11px] font-mono font-semibold text-fg-subtle uppercase tracking-wide">{g.proto}</div>
          <table className="w-full text-[12.5px]">
            <tbody>
              {g.list.map((c) => (
                <tr key={`${c.protocol}-${c.name}`} className="border-b border-border-muted/30 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-fg-default break-all">{c.name}</td>
                  <td className="px-2 py-1.5 font-mono text-fg-subtle whitespace-nowrap w-16 text-right">{c.bits ?? '?'} bit</td>
                  <td className="px-2 py-1.5 whitespace-nowrap w-20 text-center">
                    {c.forwardSecrecy
                      ? <span className="text-[10px] font-semibold text-accent-green">FS</span>
                      : <span className="text-[10px] font-semibold text-fg-subtle">no FS</span>}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap w-24 text-right">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      style={{ color: STRENGTH_COLOR[c.strength], background: STRENGTH_COLOR[c.strength] + '20' }}
                      title={c.note ?? undefined}>
                      {c.strength}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Issues panel ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<SslIssueSeverity, string> = {
  critical: '#f85149',
  high: '#f0883e',
  medium: '#d29922',
  low: '#58a6ff',
  info: '#7d8590'
}

export function IssuesPanel({ issues }: { issues: SslIssue[] }): React.JSX.Element | null {
  if (issues.length === 0) {
    return (
      <div className="border border-accent-green/30 bg-accent-green/5 rounded-lg px-4 py-3 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-accent-green" />
        <span className="text-[13px] text-accent-green font-medium">No issues detected.</span>
      </div>
    )
  }
  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-canvas-inset">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle">
        <ShieldAlert className="w-4 h-4 text-accent-yellow" />
        <span className="text-[13px] font-semibold text-fg-default">Issues</span>
        <span className="text-[12px] font-mono text-fg-subtle">{issues.length}</span>
      </div>
      <ul>
        {issues.map((i, idx) => (
          <li key={idx} className="flex gap-3 px-3 py-2 border-b border-border-muted/40 last:border-0">
            <span className="px-1.5 py-0.5 h-fit rounded text-[10px] font-bold uppercase shrink-0"
              style={{ color: SEV_COLOR[i.severity], background: SEV_COLOR[i.severity] + '20' }}>
              {i.severity}
            </span>
            <div>
              <div className="text-[13px] font-medium text-fg-default">{i.title}</div>
              <div className="text-[12px] text-fg-subtle">{i.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Diff strip vs previous scan ──────────────────────────────────────────────────

export function SslDiffStrip({ diff }: { diff: SslDiff | null }): React.JSX.Element | null {
  if (!diff || diff.previousScanAt === null) return null
  const unchanged = !diff.gradeChanged && !diff.certChanged && diff.protocolChanges.length === 0
  return (
    <div className="px-5 py-2 border-b border-border-default bg-canvas-subtle flex-shrink-0 flex items-center gap-3 flex-wrap text-[12px]">
      <span className="text-fg-subtle">vs previous scan {new Date(diff.previousScanAt).toLocaleString()}:</span>
      {unchanged && <span className="text-fg-muted">no change</span>}
      {diff.gradeChanged && (
        <span className="inline-flex items-center gap-1 text-accent-blue font-medium">
          <ArrowUpRight className="w-3.5 h-3.5" /> grade {diff.gradeChanged.from} → {diff.gradeChanged.to}
        </span>
      )}
      {diff.certChanged && (
        <span className="inline-flex items-center gap-1 text-accent-yellow font-medium">
          <RefreshCw className="w-3.5 h-3.5" /> certificate changed
        </span>
      )}
      {diff.protocolChanges.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 text-fg-muted">
          <AlertTriangle className="w-3.5 h-3.5" /> {c}
        </span>
      ))}
    </div>
  )
}

// ── shared ──
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

export type { SslScanResult }
