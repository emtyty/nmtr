import { useState, useCallback, useEffect } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ShieldCheck, ShieldAlert, ShieldX, Shield, Terminal, ArrowUpRight, ArrowDownRight,
  Globe2, Mail, RotateCcw, GitBranch, Loader2, Check, X, AlertTriangle, Minus, ChevronDown
} from 'lucide-react'
import type {
  DnsLookupResult,
  DnssecInfo,
  DnsDiff,
  DnsRecordType,
  DnsPropagationResult,
  DnsEmailSecurity,
  DnsEmailCheck,
  DnsCheckStatus,
  DnsFcrdnsResult,
  DnsDelegationResult
} from '@shared/types'

const menuItemCls =
  'flex items-center gap-2 px-3 py-1.5 text-xs text-fg-default rounded cursor-pointer outline-none data-[highlighted]:bg-canvas-hover'

// ── Feature 1: DNSSEC badge ──────────────────────────────────────────────────

const DNSSEC_STYLE: Record<DnssecInfo['status'], { label: string; color: string; Icon: typeof Shield }> = {
  secure: { label: 'DNSSEC Secure', color: '#34d399', Icon: ShieldCheck },
  insecure: { label: 'Unsigned', color: '#8b8b98', Icon: Shield },
  bogus: { label: 'DNSSEC Bogus', color: '#f87171', Icon: ShieldX },
  indeterminate: { label: 'DNSSEC Unknown', color: '#fbbf24', Icon: ShieldAlert }
}

export function DnssecBadge({ dnssec }: { dnssec: DnssecInfo }): React.JSX.Element {
  const s = DNSSEC_STYLE[dnssec.status]
  return (
    <span title={dnssec.detail}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-help"
      style={{ color: s.color, background: s.color + '20' }}>
      <s.Icon className="w-3 h-3" />
      {s.label}
      {dnssec.adFlag && <span className="opacity-70">· AD</span>}
    </span>
  )
}

// ── Feature 7: diff strip ────────────────────────────────────────────────────

export function DiffStrip({ diff }: { diff: DnsDiff | null }): React.JSX.Element | null {
  if (!diff || diff.previousAt === null) return null
  const when = new Date(diff.previousAt).toLocaleString()
  if (diff.changes.length === 0) {
    return (
      <div className="px-5 py-2 border-b border-border-default bg-canvas-subtle flex-shrink-0 text-[11px] text-fg-subtle">
        vs previous lookup {when}: <span className="text-fg-muted">no change</span>
      </div>
    )
  }
  return (
    <div className="px-5 py-2 border-b border-border-default bg-canvas-subtle flex-shrink-0 flex items-center gap-3 flex-wrap text-[11px]">
      <span className="text-fg-subtle">vs previous lookup {when}:</span>
      {diff.changes.map((c) => (
        <span key={c.type} className="inline-flex items-center gap-1.5">
          <span className="font-mono font-semibold text-accent-blue">{c.type}</span>
          {c.added.map((v) => (
            <span key={`a-${v}`} className="inline-flex items-center gap-0.5 text-accent-green font-mono" title={v}>
              <ArrowUpRight className="w-3 h-3" />{v.length > 28 ? v.slice(0, 28) + '…' : v}
            </span>
          ))}
          {c.removed.map((v) => (
            <span key={`r-${v}`} className="inline-flex items-center gap-0.5 text-accent-red font-mono line-through" title={v}>
              <ArrowDownRight className="w-3 h-3" />{v.length > 28 ? v.slice(0, 28) + '…' : v}
            </span>
          ))}
        </span>
      ))}
    </div>
  )
}

// ── Feature 8: copy as dig / nslookup ────────────────────────────────────────

const CMD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'SOA', 'TXT', 'CAA', 'SRV', 'DS', 'DNSKEY']

function digCommand(target: string, resolver: string): string {
  const at = resolver ? `@${resolver} ` : ''
  // dig accepts repeated name/type pairs in one invocation.
  const pairs = CMD_TYPES.map((t) => `${target} ${t}`).join(' ')
  return `dig ${at}+dnssec ${pairs}`
}

function nslookupCommand(target: string, resolver: string): string {
  const server = resolver ? ` ${resolver}` : ''
  return CMD_TYPES.map((t) => `nslookup -type=${t} ${target}${server}`).join('\n')
}

export function CopyCommandMenu({ target, resolver }: { target: string; resolver: string }): React.JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback((label: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }, [])
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors outline-none">
          <Terminal className="w-3.5 h-3.5" /> {copied ? `${copied} copied!` : 'Copy command'}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4}
          className="z-[200] min-w-[140px] p-1 rounded-lg bg-canvas-overlay border border-border-default shadow-2xl">
          <DropdownMenu.Item className={menuItemCls} onSelect={() => copy('dig', digCommand(target, resolver))}>dig</DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemCls} onSelect={() => copy('nslookup', nslookupCommand(target, resolver))}>nslookup</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── Status pill shared by email checks ───────────────────────────────────────

const CHECK_STYLE: Record<DnsCheckStatus, { color: string; Icon: typeof Check }> = {
  pass: { color: '#34d399', Icon: Check },
  warn: { color: '#fbbf24', Icon: AlertTriangle },
  fail: { color: '#f87171', Icon: X },
  none: { color: '#8b8b98', Icon: Minus }
}

function CheckPill({ status }: { status: DnsCheckStatus }): React.JSX.Element {
  const s = CHECK_STYLE[status]
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
      style={{ color: s.color, background: s.color + '20' }}>
      <s.Icon className="w-3 h-3" />{status}
    </span>
  )
}

// ── Diagnostics tabs (features 2, 4, 5, 6) ───────────────────────────────────

type Tab = 'propagation' | 'email' | 'fcrdns' | 'delegation'

const TABS: { id: Tab; label: string; Icon: typeof Globe2 }[] = [
  { id: 'propagation', label: 'Propagation', Icon: Globe2 },
  { id: 'email', label: 'Email security', Icon: Mail },
  { id: 'fcrdns', label: 'Reverse (FCrDNS)', Icon: RotateCcw },
  { id: 'delegation', label: 'Delegation trace', Icon: GitBranch }
]

const Spinner = (): React.JSX.Element => (
  <div className="flex items-center gap-2 text-fg-muted text-sm py-8 justify-center">
    <Loader2 className="w-4 h-4 animate-spin" /> Running…
  </div>
)

export function DnsDiagnostics({ result }: { result: DnsLookupResult }): React.JSX.Element {
  const [active, setActive] = useState<Tab | null>(null)
  const isIp = result.target !== result.queriedName // IP targets get a reverse name

  return (
    <div className="mt-6 border-t border-border-default pt-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id}
            onClick={() => setActive((cur) => (cur === t.id ? null : t.id))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              active === t.id
                ? 'border-accent-blue/40 bg-accent-blue/10 text-accent-blue'
                : 'border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover'
            }`}>
            <t.Icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {active === 'propagation' && <PropagationPanel name={result.target} />}
      {active === 'email' && (
        isIp
          ? <PanelNote text="Email security applies to domains, not IP addresses." />
          : <EmailPanel domain={result.target} resolver={result.resolver} />
      )}
      {active === 'fcrdns' && <FcrdnsPanel result={result} />}
      {active === 'delegation' && <DelegationPanel name={result.target} />}
    </div>
  )
}

function PanelNote({ text }: { text: string }): React.JSX.Element {
  return <div className="text-sm text-fg-muted py-6 text-center">{text}</div>
}

function PanelError({ error }: { error: string }): React.JSX.Element {
  return (
    <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg flex items-start gap-2 text-accent-red text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span className="font-mono opacity-90">{error}</span>
    </div>
  )
}

// ── Propagation panel (feature 2) ────────────────────────────────────────────

const PROP_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA']

function PropagationPanel({ name }: { name: string }): React.JSX.Element {
  const [type, setType] = useState<DnsRecordType>('A')
  const [data, setData] = useState<DnsPropagationResult | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback((t: DnsRecordType) => {
    setLoading(true); setData(null)
    window.nmtrAPI.dnsPropagation({ name, type: t })
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [name])

  // Run on mount; type changes re-run via onType.
  useEffect(() => { run(type) }, [run]) // eslint-disable-line react-hooks/exhaustive-deps

  const onType = (t: DnsRecordType): void => { setType(t); run(t) }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-fg-subtle">Compare</span>
        <div className="relative inline-flex items-center">
          <select value={type} onChange={(e) => onType(e.target.value as DnsRecordType)}
            className="appearance-none pl-2.5 pr-7 py-1 text-xs rounded-md bg-canvas-default border border-border-default text-fg-default focus:outline-none focus:border-accent-blue">
            {PROP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-fg-subtle absolute right-2 pointer-events-none" />
        </div>
        <span className="text-[11px] text-fg-subtle">across public resolvers</span>
        {data && (
          <span className={`ml-2 text-[11px] font-semibold ${data.consistent ? 'text-accent-green' : 'text-accent-red'}`}>
            {data.consistent ? '✓ consistent' : '✗ mismatch detected'}
          </span>
        )}
      </div>
      {loading && <Spinner />}
      {data && (
        <div className="border border-border-default rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-canvas-inset">
              <tr className="text-fg-subtle text-left border-b border-border-muted">
                <th className="px-3 py-2 font-semibold w-36">Resolver</th>
                <th className="px-3 py-2 font-semibold">{type} values</th>
                <th className="px-3 py-2 font-semibold w-20 text-right">RTT</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.resolver} className="border-b border-border-muted/40 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-fg-default">{e.label}<span className="text-fg-subtle"> {e.resolver}</span></td>
                  <td className="px-3 py-1.5 font-mono text-fg-muted break-all">
                    {e.error ? <span className="text-accent-red">{e.error}</span>
                      : e.values.length ? e.values.join(', ')
                      : <span className="text-fg-subtle">{e.rcode ?? 'no records'}</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-fg-subtle text-right">{e.rttMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Email security panel (feature 4) ─────────────────────────────────────────

function EmailRow({ label, check }: { label: string; check: DnsEmailCheck }): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 px-3 py-2 border-b border-border-muted/40 last:border-0">
      <div className="w-20 shrink-0 flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-default">{label}</span>
      </div>
      <CheckPill status={check.status} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-fg-muted">{check.note}</p>
        {check.value && <p className="text-[11px] font-mono text-fg-subtle break-all mt-0.5">{check.value}</p>}
      </div>
    </div>
  )
}

function EmailPanel({ domain, resolver }: { domain: string; resolver: string }): React.JSX.Element {
  const [data, setData] = useState<DnsEmailSecurity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.nmtrAPI.dnsEmail({ domain, resolver })
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [domain, resolver])

  if (loading) return <Spinner />
  if (!data) return <PanelError error="Email-security check failed." />
  if (data.error) return <PanelError error={data.error} />

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <EmailRow label="SPF" check={data.spf} />
      <EmailRow label="DMARC" check={data.dmarc} />
      <EmailRow label="MTA-STS" check={data.mtaSts} />
      <EmailRow label="BIMI" check={data.bimi} />
      <div className="flex items-start gap-3 px-3 py-2">
        <div className="w-20 shrink-0"><span className="text-xs font-semibold text-fg-default">DKIM</span></div>
        <CheckPill status={data.dkim.length ? 'pass' : 'none'} />
        <div className="flex-1 min-w-0">
          {data.dkim.length ? (
            <div className="space-y-1">
              {data.dkim.map((d) => (
                <p key={d.selector} className="text-[11px] font-mono text-fg-muted break-all">
                  <span className="text-accent-blue">{d.selector}</span>: {d.value.length > 80 ? d.value.slice(0, 80) + '…' : d.value}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-fg-muted">
              No DKIM key found among common selectors. DKIM uses arbitrary selectors, so a missing result here doesn't prove DKIM is unconfigured.
            </p>
          )}
          <p className="text-[10px] text-fg-subtle mt-1">Probed: {data.dkimChecked.join(', ')}</p>
        </div>
      </div>
    </div>
  )
}

// ── FCrDNS panel (feature 5) ─────────────────────────────────────────────────

function FcrdnsPanel({ result }: { result: DnsLookupResult }): React.JSX.Element {
  const ips = [
    ...(result.sets.find((s) => s.type === 'A')?.records.map((r) => r.value) ?? []),
    ...(result.sets.find((s) => s.type === 'AAAA')?.records.map((r) => r.value) ?? [])
  ]
  const [data, setData] = useState<DnsFcrdnsResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (ips.length === 0) { setLoading(false); return }
    window.nmtrAPI.dnsFcrdns({ ips, resolver: result.resolver })
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [ips.join(','), result.resolver]) // eslint-disable-line react-hooks/exhaustive-deps

  if (ips.length === 0) return <PanelNote text="No A/AAAA records to reverse-check." />
  if (loading) return <Spinner />
  if (!data) return <PanelError error="Reverse-DNS check failed." />
  if (data.error) return <PanelError error={data.error} />

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-canvas-inset">
          <tr className="text-fg-subtle text-left border-b border-border-muted">
            <th className="px-3 py-2 font-semibold w-44">IP</th>
            <th className="px-3 py-2 font-semibold">PTR → forward</th>
            <th className="px-3 py-2 font-semibold w-28 text-right">FCrDNS</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((e) => (
            <tr key={e.ip} className="border-b border-border-muted/40 last:border-0">
              <td className="px-3 py-1.5 font-mono text-fg-default break-all">{e.ip}</td>
              <td className="px-3 py-1.5 font-mono text-fg-muted break-all">
                {e.ptr ? <>{e.ptr}{e.forwardIps.length > 0 && <span className="text-fg-subtle"> → {e.forwardIps.join(', ')}</span>}</>
                  : <span className="text-fg-subtle">no PTR</span>}
              </td>
              <td className="px-3 py-1.5 text-right">
                {e.confirmed
                  ? <CheckPill status="pass" />
                  : <CheckPill status={e.ptr ? 'warn' : 'none'} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Delegation trace panel (feature 6) ───────────────────────────────────────

function DelegationPanel({ name }: { name: string }): React.JSX.Element {
  const [data, setData] = useState<DnsDelegationResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.nmtrAPI.dnsDelegation({ name })
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [name])

  if (loading) return <Spinner />
  if (!data) return <PanelError error="Delegation trace failed." />
  if (data.error) return <PanelError error={data.error} />

  return (
    <div className="space-y-2">
      {data.steps.map((step, i) => (
        <div key={i} className="border border-border-default rounded-lg p-3 bg-canvas-inset">
          <div className="flex items-center gap-2 mb-1 text-[11px]">
            <span className="font-mono font-semibold text-accent-blue">#{i + 1}</span>
            <span className="text-fg-muted">queried</span>
            <span className="font-mono text-fg-default">{step.serverName ? `${step.serverName} ` : ''}({step.serverQueried})</span>
            {step.authoritative && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-accent-green/15 text-accent-green">AUTHORITATIVE</span>
            )}
            <span className="ml-auto font-mono text-fg-subtle">{step.rttMs}ms</span>
          </div>
          {step.error ? (
            <p className="text-[11px] text-accent-red font-mono">{step.error}</p>
          ) : step.nsRecords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {step.nsRecords.map((ns) => (
                <span key={ns} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-canvas-subtle text-fg-muted">{ns}</span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-fg-subtle">No NS records returned.</p>
          )}
        </div>
      ))}
    </div>
  )
}
