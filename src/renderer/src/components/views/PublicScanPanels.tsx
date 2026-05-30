import { useState } from 'react'
import {
  ShieldCheck, ShieldAlert, Lock, Cookie, FileCode2, Boxes, Globe2, Mail,
  ArrowUpRight, Check, X, AlertTriangle, Server, ChevronRight
} from 'lucide-react'
import type {
  PubScanGrade,
  PubScanResult,
  PubFinding,
  PubFindingSeverity,
  PubHeaderCheck,
  PubCookie,
  PubCspReport,
  PubTech,
  PubThirdParty,
  PubTlsSummary,
  PubComplianceItem,
  PubCategoryGrade,
  PubScanDiff,
  PubCheckStatus,
  DnsEmailSecurity
} from '@shared/types'

// ── Grade badge ────────────────────────────────────────────────────────────────

const GRADE_STYLE: Record<PubScanGrade, { bg: string; fg: string }> = {
  'A+': { bg: '#3fb950', fg: '#04130a' },
  A: { bg: '#3fb950', fg: '#04130a' },
  B: { bg: '#d29922', fg: '#1a1200' },
  C: { bg: '#d29922', fg: '#1a1200' },
  D: { bg: '#f0883e', fg: '#1a0d00' },
  F: { bg: '#f85149', fg: '#1a0202' }
}

export function GradeBadge({ grade, size = 'lg' }: { grade: PubScanGrade; size?: 'sm' | 'lg' }): React.JSX.Element {
  const s = GRADE_STYLE[grade]
  const dim = size === 'lg' ? 'w-16 h-16 text-3xl rounded-xl' : 'w-9 h-9 text-base rounded-lg'
  return (
    <span className={`inline-flex items-center justify-center font-extrabold ${dim}`} style={{ background: s.bg, color: s.fg }}>
      {grade}
    </span>
  )
}

// ── shared bits ──────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  headers: 'Headers', cookies: 'Cookies', csp: 'CSP', tls: 'TLS', dns: 'DNS / email', software: 'Software', privacy: 'Privacy'
}
const SEV_COLOR: Record<PubFindingSeverity, string> = {
  critical: '#f85149', high: '#f0883e', medium: '#d29922', low: '#58a6ff', info: '#7d8590'
}
const STATUS_ICON: Record<PubCheckStatus, React.ReactNode> = {
  pass: <Check className="w-3.5 h-3.5 text-accent-green" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-accent-yellow" />,
  fail: <X className="w-3.5 h-3.5 text-accent-red" />,
  info: <AlertTriangle className="w-3.5 h-3.5 text-fg-subtle" />
}
const SEV_ORDER: Record<PubFindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function PanelShell({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-canvas-inset">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle">
        {icon}
        <span className="text-[13px] font-semibold text-fg-default">{title}</span>
        {count !== undefined && <span className="text-[12px] font-mono text-fg-subtle">{count}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Category grade matrix ──────────────────────────────────────────────────────

export function CategoryMatrix({ grades }: { grades: PubCategoryGrade[] }): React.JSX.Element {
  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
      {grades.map((g) => (
        <div key={g.category} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border-default bg-canvas-inset">
          <GradeBadge grade={g.grade} size="sm" />
          <span className="text-[12.5px] text-fg-muted">{CATEGORY_LABEL[g.category] ?? g.category}</span>
        </div>
      ))}
    </div>
  )
}

// ── Findings ───────────────────────────────────────────────────────────────────

export function FindingsPanel({ findings }: { findings: PubFinding[] }): React.JSX.Element {
  if (findings.length === 0) {
    return (
      <div className="border border-accent-green/30 bg-accent-green/5 rounded-lg px-4 py-3 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-accent-green" />
        <span className="text-[13px] text-accent-green font-medium">No issues detected.</span>
      </div>
    )
  }
  const sorted = [...findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  return (
    <PanelShell icon={<ShieldAlert className="w-4 h-4 text-accent-yellow" />} title="Findings" count={findings.length}>
      <ul>
        {sorted.map((f) => (
          <li key={f.id} className="flex gap-3 px-3 py-2 border-b border-border-muted/40 last:border-0">
            <span className="px-1.5 py-0.5 h-fit rounded text-[10px] font-bold uppercase shrink-0"
              style={{ color: SEV_COLOR[f.severity], background: SEV_COLOR[f.severity] + '20' }}>
              {f.severity}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-fg-default">
                {f.title}
                <span className="ml-2 text-[11px] font-normal text-fg-subtle">{CATEGORY_LABEL[f.category] ?? f.category}</span>
              </div>
              <div className="text-[12px] text-fg-subtle">{f.detail}</div>
              {f.recommendation && <div className="text-[12px] text-accent-blue/80 mt-0.5">→ {f.recommendation}</div>}
            </div>
          </li>
        ))}
      </ul>
    </PanelShell>
  )
}

// ── Headers ──────────────────────────────────────────────────────────────────────

export function HeadersPanel({ headers }: { headers: PubHeaderCheck[] }): React.JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const expand = (name: string): void => setExpanded((e) => ({ ...e, [name]: true }))
  return (
    <PanelShell icon={<Globe2 className="w-4 h-4 text-accent-blue" />} title="HTTP security headers">
      <table className="w-full text-[12.5px]">
        <tbody>
          {headers.map((hd) => {
            // A row is worth expanding when its explanation isn't already the
            // visible content — i.e. it has a raw value (the note is hidden).
            const hasDetail = Boolean(hd.value)
            const open = expanded[hd.name]
            return (
              <tr
                key={hd.name}
                onClick={hasDetail && !open ? () => expand(hd.name) : undefined}
                className={`border-b border-border-muted/40 last:border-0 ${hasDetail && !open ? 'cursor-pointer hover:bg-canvas-hover/50' : ''} ${open ? 'bg-canvas-hover/40' : ''}`}
                title={hasDetail && !open ? 'Click for detail' : undefined}
              >
                <td className="px-3 py-1.5 w-6 align-top">{STATUS_ICON[hd.status]}</td>
                <td className="px-1 py-1.5 font-mono text-fg-default w-56 align-top">{hd.name}</td>
                <td className="px-3 py-1.5 text-fg-subtle">
                  <span className="flex items-center gap-1.5">
                    {hd.value
                      ? <span className="font-mono text-fg-muted break-all">{hd.value}</span>
                      : <span>{hd.note}</span>}
                    {hasDetail && (
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-fg-subtle transition-transform ${open ? 'rotate-90' : ''}`} />
                    )}
                  </span>
                  {hasDetail && open && <div className="mt-1 text-[12px] text-fg-subtle">{hd.note}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </PanelShell>
  )
}

// ── Cookies ──────────────────────────────────────────────────────────────────────

function Flag({ ok, label }: { ok: boolean; label: string }): React.JSX.Element {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${ok ? 'text-accent-green bg-accent-green/10' : 'text-accent-yellow bg-accent-yellow/10'}`}>
      {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{label}
    </span>
  )
}

export function CookiesPanel({ cookies }: { cookies: PubCookie[] }): React.JSX.Element | null {
  if (cookies.length === 0) return null
  return (
    <PanelShell icon={<Cookie className="w-4 h-4 text-accent-blue" />} title="Cookies" count={cookies.length}>
      <table className="w-full text-[12.5px]">
        <tbody>
          {cookies.map((c) => (
            <tr key={c.name} className="border-b border-border-muted/40 last:border-0">
              <td className="px-3 py-1.5 font-mono text-fg-default break-all">{c.name}</td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                <span className="inline-flex gap-1.5">
                  <Flag ok={c.secure} label="Secure" />
                  <Flag ok={c.httpOnly} label="HttpOnly" />
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.sameSite ? 'text-fg-muted bg-canvas-overlay' : 'text-accent-yellow bg-accent-yellow/10'}`}>
                    SameSite={c.sameSite ?? '—'}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  )
}

// ── CSP ────────────────────────────────────────────────────────────────────────────

export function CspPanel({ csp }: { csp: PubCspReport }): React.JSX.Element {
  return (
    <PanelShell icon={<FileCode2 className="w-4 h-4 text-accent-blue" />} title="Content-Security-Policy">
      {!csp.present ? (
        <p className="px-3 py-3 text-[12.5px] text-fg-subtle">No Content-Security-Policy header was sent.</p>
      ) : (
        <div className="px-3 py-2 space-y-2">
          <div className="text-[12px] text-fg-subtle">{csp.directiveCount} directive{csp.directiveCount !== 1 ? 's' : ''}</div>
          <pre className="text-[11.5px] font-mono text-fg-muted whitespace-pre-wrap break-all bg-canvas-default rounded p-2 border border-border-muted/50">{csp.raw}</pre>
          {csp.issues.length > 0
            ? <ul className="space-y-1">
                {csp.issues.map((i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-accent-yellow">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{i}
                  </li>
                ))}
              </ul>
            : <div className="flex items-center gap-1.5 text-[12px] text-accent-green"><Check className="w-3.5 h-3.5" />No obvious weaknesses.</div>}
        </div>
      )}
    </PanelShell>
  )
}

// ── TLS summary ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

export function TlsSummaryPanel({ tls }: { tls: PubTlsSummary | null }): React.JSX.Element | null {
  if (!tls) return null
  const expColor = tls.daysRemaining === null ? 'text-fg-subtle' : tls.daysRemaining < 0 ? 'text-accent-red' : tls.daysRemaining <= 21 ? 'text-accent-yellow' : 'text-accent-green'
  return (
    <PanelShell icon={<Lock className="w-4 h-4 text-accent-blue" />} title="Transport (TLS)">
      <div className="px-3 py-2 grid gap-1.5 text-[12.5px] font-mono">
        <div className="flex gap-2"><span className="w-28 text-fg-subtle">Protocol</span><span className="text-fg-default">{tls.protocol ?? '—'}</span></div>
        <div className="flex gap-2">
          <span className="w-28 text-fg-subtle">Trust</span>
          <span className={tls.trusted ? 'text-accent-green' : 'text-accent-red'}>{tls.trusted ? 'trusted chain' : 'NOT trusted'}</span>
          <span className={tls.hostnameMatch ? 'text-accent-green' : 'text-accent-red'}>· {tls.hostnameMatch ? 'hostname ok' : 'hostname mismatch'}</span>
        </div>
        <div className="flex gap-2"><span className="w-28 text-fg-subtle">Issuer</span><span className="text-fg-muted break-all">{tls.certIssuer ?? '—'}</span></div>
        <div className="flex gap-2">
          <span className="w-28 text-fg-subtle">Expires</span>
          <span className={expColor}>{fmtDate(tls.validTo)}{tls.daysRemaining !== null ? ` (${tls.daysRemaining < 0 ? 'expired' : `${tls.daysRemaining}d`})` : ''}</span>
        </div>
      </div>
    </PanelShell>
  )
}

// ── DNS / email security ──────────────────────────────────────────────────────────

const EMAIL_STATUS_COLOR: Record<string, string> = { pass: 'text-accent-green', warn: 'text-accent-yellow', fail: 'text-accent-red', none: 'text-fg-subtle' }

export function EmailPanel({ email }: { email: DnsEmailSecurity | null }): React.JSX.Element | null {
  if (!email || email.error) return null
  const Row = ({ label, status, note }: { label: string; status: string; note: string }): React.JSX.Element => (
    <tr className="border-b border-border-muted/40 last:border-0">
      <td className="px-3 py-1.5 font-mono text-fg-default w-20">{label}</td>
      <td className={`px-2 py-1.5 font-semibold uppercase text-[11px] w-16 ${EMAIL_STATUS_COLOR[status] ?? 'text-fg-subtle'}`}>{status}</td>
      <td className="px-3 py-1.5 text-[12px] text-fg-subtle">{note}</td>
    </tr>
  )
  return (
    <PanelShell icon={<Mail className="w-4 h-4 text-accent-blue" />} title="DNS / email security">
      <table className="w-full text-[12.5px]">
        <tbody>
          <Row label="SPF" status={email.spf.status} note={email.spf.note} />
          <Row label="DMARC" status={email.dmarc.status} note={email.dmarc.note} />
          <tr className="border-b border-border-muted/40 last:border-0">
            <td className="px-3 py-1.5 font-mono text-fg-default">DKIM</td>
            <td className={`px-2 py-1.5 font-semibold uppercase text-[11px] ${email.dkim.length ? 'text-accent-green' : 'text-fg-subtle'}`}>{email.dkim.length ? 'found' : 'none'}</td>
            <td className="px-3 py-1.5 text-[12px] text-fg-subtle">{email.dkim.length ? `${email.dkim.length} selector(s): ${email.dkim.map((d) => d.selector).join(', ')}` : 'No DKIM selector found among common names'}</td>
          </tr>
        </tbody>
      </table>
    </PanelShell>
  )
}

// ── Software fingerprint ──────────────────────────────────────────────────────────

export function TechPanel({ tech }: { tech: PubTech[] }): React.JSX.Element | null {
  if (tech.length === 0) return null
  return (
    <PanelShell icon={<Boxes className="w-4 h-4 text-accent-blue" />} title="Software fingerprint" count={tech.length}>
      <table className="w-full text-[12.5px]">
        <tbody>
          {tech.map((t) => (
            <tr key={`${t.category}-${t.name}`} className="border-b border-border-muted/40 last:border-0">
              <td className="px-3 py-1.5 text-fg-subtle w-28 uppercase text-[11px] tracking-wide">{t.category}</td>
              <td className="px-2 py-1.5 font-mono text-fg-default">{t.name}{t.version ? <span className="text-accent-blue"> {t.version}</span> : ''}</td>
              <td className="px-3 py-1.5 text-[12px] text-fg-subtle">{t.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  )
}

// ── Third-party origins ──────────────────────────────────────────────────────────

export function ThirdPartyPanel({ items }: { items: PubThirdParty[] }): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <PanelShell icon={<Server className="w-4 h-4 text-accent-blue" />} title="Third-party origins" count={items.length}>
      <table className="w-full text-[12.5px]">
        <tbody>
          {items.map((t) => (
            <tr key={t.host} className="border-b border-border-muted/40 last:border-0">
              <td className="px-3 py-1.5 font-mono text-fg-default break-all">{t.host}</td>
              <td className="px-2 py-1.5 text-fg-subtle">{t.kinds.join(', ')}</td>
              <td className="px-2 py-1.5 text-right font-mono text-fg-subtle w-12">{t.count}</td>
              <td className="px-3 py-1.5 text-right w-20">
                {t.tracker && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-accent-yellow bg-accent-yellow/10">tracker</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  )
}

// ── Compliance matrix ──────────────────────────────────────────────────────────────

const COMP_COLOR: Record<PubCheckStatus, string> = {
  pass: 'text-accent-green border-accent-green/30 bg-accent-green/5',
  warn: 'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/5',
  fail: 'text-accent-red border-accent-red/30 bg-accent-red/5',
  info: 'text-fg-subtle border-border-default bg-canvas-inset'
}

export function CompliancePanel({ items }: { items: PubComplianceItem[] }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const expand = (name: string): void => setExpanded((e) => ({ ...e, [name]: true }))
  if (items.length === 0) return null
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] items-start">
      {items.map((c) => {
        const hasDetail = c.details.length > 0
        const open = expanded[c.framework]
        return (
          <div
            key={c.framework}
            onClick={hasDetail && !open ? () => expand(c.framework) : undefined}
            className={`rounded-lg border px-3 py-2.5 ${COMP_COLOR[c.status]} ${hasDetail && !open ? 'cursor-pointer' : ''}`}
            title={hasDetail && !open ? 'Click for detail' : undefined}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-fg-default">
                {hasDetail && <ChevronRight className={`w-3.5 h-3.5 text-fg-subtle transition-transform ${open ? 'rotate-90' : ''}`} />}
                {c.framework}
              </span>
              <span className="text-[11px] font-bold uppercase">{c.status}</span>
            </div>
            <ul className="space-y-0.5">
              {c.notes.map((n) => <li key={n} className="text-[11.5px] text-fg-subtle">{n}</li>)}
            </ul>
            {hasDetail && open && (
              <ul className="mt-2 pt-2 border-t border-border-muted/50 space-y-1">
                {c.details.map((d) => (
                  <li key={d} className="flex items-start gap-1.5 text-[11.5px] text-fg-muted">
                    <span className="text-fg-subtle mt-0.5">·</span>
                    <span className="break-words">{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Diff strip ──────────────────────────────────────────────────────────────────

export function DiffStrip({ diff }: { diff: PubScanDiff | null }): React.JSX.Element | null {
  if (!diff || diff.previousScanAt === null) return null
  const unchanged = !diff.gradeChanged && diff.newFindings.length === 0 && diff.resolvedFindings.length === 0
  return (
    <div className="px-5 py-2 border-b border-border-default bg-canvas-subtle flex-shrink-0 flex items-center gap-3 flex-wrap text-[12px]">
      <span className="text-fg-subtle">vs previous scan {new Date(diff.previousScanAt).toLocaleString()}:</span>
      {unchanged && <span className="text-fg-muted">no change</span>}
      {diff.gradeChanged && (
        <span className="inline-flex items-center gap-1 text-accent-blue font-medium">
          <ArrowUpRight className="w-3.5 h-3.5" /> grade {diff.gradeChanged.from} → {diff.gradeChanged.to}
        </span>
      )}
      {diff.newFindings.length > 0 && (
        <span className="inline-flex items-center gap-1 text-accent-yellow font-medium">
          <AlertTriangle className="w-3.5 h-3.5" /> {diff.newFindings.length} new
        </span>
      )}
      {diff.resolvedFindings.length > 0 && (
        <span className="inline-flex items-center gap-1 text-accent-green font-medium">
          <Check className="w-3.5 h-3.5" /> {diff.resolvedFindings.length} resolved
        </span>
      )}
    </div>
  )
}

export type { PubScanResult }
