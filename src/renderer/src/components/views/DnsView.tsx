import { useState, useEffect, useCallback, useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Search, RefreshCw, AlertCircle, Globe, Download, Copy, Crosshair, MoreVertical,
  ChevronDown, Clock, Server, History, Trash2, X, Eye, ShieldCheck
} from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import {
  DnssecBadge, DiffStrip, CopyCommandMenu, DnsDiagnostics
} from './DnsDiagnosticsPanels'
import type {
  DnsLookupConfig,
  DnsLookupResult,
  DnsRecord,
  DnsRecordSet,
  DnsRecordType,
  DnsExportFormat,
  DnsHistoryRecord
} from '@shared/types'

// Watch-mode (auto-refresh) interval options.
const WATCH_INTERVALS: { label: string; ms: number }[] = [
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: 30_000 },
  { label: '60s', ms: 60_000 }
]

// Resolver presets. '' = the OS-configured resolver.
const RESOLVERS: { label: string; value: string }[] = [
  { label: 'System default', value: '' },
  { label: 'Cloudflare (1.1.1.1)', value: '1.1.1.1' },
  { label: 'Google (8.8.8.8)', value: '8.8.8.8' },
  { label: 'Quad9 (9.9.9.9)', value: '9.9.9.9' }
]

// Short blurb per record type, shown beside the type heading.
const TYPE_BLURB: Record<DnsRecordType, string> = {
  A: 'IPv4 address',
  AAAA: 'IPv6 address',
  CNAME: 'Canonical name (alias)',
  MX: 'Mail exchanger',
  NS: 'Authoritative name server',
  PTR: 'Reverse (IP → name)',
  SRV: 'Service location',
  SOA: 'Start of authority',
  TXT: 'Text record',
  CAA: 'Certificate authority authorization',
  DS: 'Delegation signer (DNSSEC)',
  DNSKEY: 'DNSSEC public key'
}

const menuItemCls =
  'flex items-center gap-2 px-3 py-1.5 text-sm text-fg-default rounded cursor-pointer outline-none data-[highlighted]:bg-canvas-hover'

function formatTtl(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
}

// ── Per-value action menu (copy / open / trace) ──────────────────────────────

function ValueActions({ record, type }: { record: DnsRecord; type: DnsRecordType }): React.JSX.Element {
  const traceHost = useUIStore((s) => s.traceHost)
  const resolveDnsFor = useUIStore((s) => s.resolveDnsFor)

  // What a follow-up action should target: an IP for A/AAAA, the host for NS/MX/CNAME/PTR/SRV.
  const host =
    type === 'A' || type === 'AAAA' ? record.value
    : type === 'MX' ? String(record.fields.exchange ?? '')
    : type === 'SRV' ? String(record.fields.target ?? '')
    : type === 'NS' || type === 'CNAME' || type === 'PTR' ? String(record.fields.target ?? record.value)
    : ''

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="p-1 rounded text-fg-subtle hover:text-fg-default hover:bg-canvas-hover outline-none" title="Actions">
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4}
          className="z-[200] min-w-[180px] p-1 rounded-lg bg-canvas-overlay border border-border-default shadow-2xl">
          <DropdownMenu.Item className={menuItemCls}
            onSelect={() => navigator.clipboard.writeText(record.value)}>
            <Copy className="w-3.5 h-3.5 text-fg-muted" /> Copy value
          </DropdownMenu.Item>
          {host && (
            <>
              <DropdownMenu.Item className={menuItemCls} onSelect={() => resolveDnsFor(host)}>
                <Globe className="w-3.5 h-3.5 text-accent-blue" /> Resolve {host}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItemCls} onSelect={() => traceHost(host)}>
                <Crosshair className="w-3.5 h-3.5 text-fg-muted" /> Traceroute
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── One record-type section ──────────────────────────────────────────────────

function RecordSetCard({ set }: { set: DnsRecordSet }): React.JSX.Element {
  const has = set.records.length > 0
  const statusNote = set.error
    ? set.error
    : !has
      ? (set.rcode && set.rcode !== 'NOERROR' ? set.rcode : 'no records')
      : null

  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-canvas-inset">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle">
        <span className="font-mono text-base font-semibold text-accent-blue w-16">{set.type}</span>
        <span className="text-[12px] text-fg-subtle flex-1 truncate">{TYPE_BLURB[set.type]}</span>
        {has ? (
          <span className="text-[12px] font-mono text-accent-green">{set.records.length}</span>
        ) : (
          <span className={`text-[12px] font-mono ${set.error ? 'text-accent-red' : 'text-fg-subtle'}`}>
            {statusNote}
          </span>
        )}
      </div>
      {has && (
        <table className="w-full text-[13px]">
          <tbody>
            {set.records.map((r, i) => (
              <tr key={i} className="border-b border-border-muted/40 last:border-0 hover:bg-canvas-hover/50 group">
                <td className="px-3 py-1.5 font-mono text-fg-default align-top break-all">{r.value}</td>
                <td className="px-3 py-1.5 text-fg-subtle font-mono whitespace-nowrap align-top w-16 text-right" title={`TTL ${r.ttl}s`}>
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{formatTtl(r.ttl)}</span>
                </td>
                <td className="px-1 py-1.5 text-right align-top w-8">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ValueActions record={r} type={set.type} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Lookup history ────────────────────────────────────────────────────────────

function HistoryTable({
  history,
  onPick,
  onClear,
  onDelete
}: {
  history: DnsHistoryRecord[]
  onPick: (rec: DnsHistoryRecord) => void
  onClear: () => void
  onDelete: (id: string) => void
}): React.JSX.Element | null {
  if (history.length === 0) return null
  return (
    <div className="mt-6 border-t border-border-default pt-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <History className="w-3.5 h-3.5 text-fg-subtle" />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Lookup history</span>
        <span className="text-[12px] font-mono text-fg-subtle">{history.length}</span>
        <button onClick={onClear}
          className="ml-auto inline-flex items-center gap-1 text-[12px] text-fg-subtle hover:text-accent-red transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>
      <div className="border border-border-default rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-canvas-inset">
            <tr className="text-fg-subtle text-left border-b border-border-muted">
              <th className="px-3 py-2 font-semibold">When</th>
              <th className="px-3 py-2 font-semibold">Target</th>
              <th className="px-3 py-2 font-semibold w-40">Resolver</th>
              <th className="px-3 py-2 font-semibold w-20 text-right">Records</th>
              <th className="px-3 py-2 font-semibold">Types</th>
              <th className="px-2 py-2 font-semibold w-8"></th>
            </tr>
          </thead>
          <tbody>
            {history.map((rec) => (
              <tr key={rec.id} onClick={() => onPick(rec)} title="Load this result"
                className="border-b border-border-muted/40 last:border-0 hover:bg-canvas-hover/60 cursor-pointer group">
                <td className="px-3 py-1.5 text-fg-muted whitespace-nowrap">{formatWhen(rec.scannedAt)}</td>
                <td className="px-3 py-1.5 font-mono text-fg-default">
                  {rec.target}
                  {rec.queriedName !== rec.target && (
                    <span className="text-fg-subtle"> ({rec.queriedName})</span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-fg-subtle">{rec.resolver}</td>
                <td className="px-3 py-1.5 font-mono text-right">
                  <span className={rec.totalRecords > 0 ? 'text-accent-green' : 'text-fg-subtle'}>
                    {rec.totalRecords}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {rec.typeCounts.length === 0 ? (
                      <span className="text-fg-subtle">—</span>
                    ) : rec.typeCounts.map((t) => (
                      <span key={t.type}
                        className="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-accent-blue/10 text-accent-blue">
                        {t.type}{t.count > 1 ? `·${t.count}` : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(rec.id) }}
                    title="Delete this entry"
                    className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-accent-red hover:bg-canvas-hover transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DnsView(): React.JSX.Element {
  const prefill = useUIStore((s) => s.dnsPrefill)
  const clearPrefill = useUIStore((s) => s.clearDnsPrefill)

  const [target, setTarget] = useState('')
  const [resolver, setResolver] = useState('')
  const [authoritative, setAuthoritative] = useState(false)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [result, setResult] = useState<DnsLookupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [history, setHistory] = useState<DnsHistoryRecord[]>([])
  const [watchMs, setWatchMs] = useState(0) // 0 = off

  // Refs let a single runLookup() read the latest inputs without being re-created
  // on each keystroke (and let history picks / watch ticks override values).
  const targetRef = useRef(target)
  targetRef.current = target
  const resolverRef = useRef(resolver)
  resolverRef.current = resolver
  const authoritativeRef = useRef(authoritative)
  authoritativeRef.current = authoritative

  const loadHistory = useCallback(() => {
    window.nmtrAPI.dnsHistoryGet().then(setHistory).catch(() => {})
  }, [])

  const runLookup = useCallback(async (override?: {
    target?: string; resolver?: string; skipHistory?: boolean
  }) => {
    const t = (override?.target ?? targetRef.current).trim()
    if (!t) return
    setResolving(true)
    setError(null)
    const config: DnsLookupConfig = {
      target: t,
      resolver: override?.resolver ?? resolverRef.current,
      authoritative: authoritativeRef.current,
      skipHistory: override?.skipHistory
    }
    try {
      const res = await window.nmtrAPI.dnsLookup({ config })
      if (res.error) {
        setError(res.error)
        setResult(null)
      } else {
        setError(null)
        setResult(res)
        if (!config.skipHistory) loadHistory() // main persisted it; refresh the table
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setResult(null)
    } finally {
      setResolving(false)
    }
  }, [loadHistory])

  // Load persisted history once on mount.
  useEffect(() => { loadHistory() }, [loadHistory])

  // Watch mode: re-resolve on an interval. Ticks skip history to avoid spam.
  useEffect(() => {
    if (watchMs <= 0) return
    const id = setInterval(() => { void runLookup({ skipHistory: true }) }, watchMs)
    return () => clearInterval(id)
  }, [watchMs, runLookup])

  // Consume a prefilled target from another view (e.g. a port-scan or trace action).
  useEffect(() => {
    if (prefill) {
      setTarget(prefill)
      clearPrefill()
      void runLookup({ target: prefill })
    }
  }, [prefill, clearPrefill, runLookup])

  // Restore a past lookup instantly from the stored result — no re-resolve.
  const pickHistory = useCallback((rec: DnsHistoryRecord) => {
    setTarget(rec.target)
    setResolver(rec.resolver)
    setError(null)
    setResult(rec.result)
  }, [])

  const clearHistory = useCallback(() => {
    setWatchMs(0)
    window.nmtrAPI.dnsHistoryClear().then(() => setHistory([])).catch(() => {})
  }, [])

  const deleteHistory = useCallback((id: string) => {
    window.nmtrAPI.dnsHistoryRemove(id).then(loadHistory).catch(() => {})
  }, [loadHistory])

  const totalRecords = result?.sets.reduce((n, s) => n + s.records.length, 0) ?? 0
  const visibleSets = result
    ? hideEmpty ? result.sets.filter((s) => s.records.length > 0) : result.sets
    : []

  return (
    <div className="flex-1 flex flex-col bg-canvas-default overflow-hidden">
      {/* ── Controls bar ── */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runLookup() }}
          placeholder="Hostname or IP (e.g. example.com)"
          spellCheck={false}
          disabled={resolving}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-base font-mono rounded-md bg-canvas-default border border-border-default text-fg-default placeholder:text-fg-subtle focus:outline-none focus:border-accent-blue disabled:opacity-60"
        />

        <div className="relative inline-flex items-center">
          <select
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            disabled={resolving}
            className="appearance-none pl-3 pr-8 py-1.5 text-base rounded-md bg-canvas-default border border-border-default text-fg-default focus:outline-none focus:border-accent-blue disabled:opacity-60"
            title="DNS resolver"
          >
            {RESOLVERS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-fg-subtle absolute right-2 pointer-events-none" />
        </div>

        {/* Authoritative toggle — query the zone's own NS instead of a recursive cache */}
        <button onClick={() => setAuthoritative((v) => !v)} disabled={resolving}
          title="Query the zone's authoritative name servers directly (bypasses recursive cache)"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md border transition-colors disabled:opacity-60 ${
            authoritative ? 'border-accent-blue/40 bg-accent-blue/10 text-accent-blue' : 'border-border-default text-fg-muted hover:text-fg-default'
          }`}>
          <ShieldCheck className="w-3.5 h-3.5" /> Authoritative
        </button>

        {/* Watch mode — auto re-resolve on an interval (ticks skip history) */}
        <div className="relative inline-flex items-center">
          <select
            value={watchMs}
            onChange={(e) => setWatchMs(Number(e.target.value))}
            title="Auto-refresh interval"
            className={`appearance-none pl-7 pr-7 py-1.5 text-sm rounded-md bg-canvas-default border focus:outline-none ${
              watchMs > 0 ? 'border-accent-green/40 text-accent-green' : 'border-border-default text-fg-muted'
            }`}
          >
            <option value={0}>Watch: off</option>
            {WATCH_INTERVALS.map((w) => <option key={w.ms} value={w.ms}>Watch: {w.label}</option>)}
          </select>
          <Eye className={`w-3.5 h-3.5 absolute left-2 pointer-events-none ${watchMs > 0 ? 'text-accent-green' : 'text-fg-subtle'}`} />
          <ChevronDown className="w-3.5 h-3.5 text-fg-subtle absolute right-2 pointer-events-none" />
        </div>

        <button onClick={() => runLookup()} disabled={!target.trim() || resolving}
          className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-base font-semibold rounded-md bg-accent-blue text-canvas-default hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
          {resolving
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Resolving…</>
            : result
              ? <><RefreshCw className="w-4 h-4" /> Re-resolve</>
              : <><Search className="w-4 h-4" /> Resolve</>}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-5 mt-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg flex items-start gap-3 text-accent-red">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-base font-mono opacity-90">{error}</p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!resolving && !result && !error && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center justify-center gap-4 text-center px-6 py-16">
            <Globe className="w-16 h-16 text-fg-subtle opacity-40" />
            <div>
              <p className="text-fg-subtle text-lg font-medium mb-1">DNS Resolver</p>
              <p className="text-fg-muted text-base">Enter a hostname or IP to resolve every record type in one scan</p>
              <p className="text-fg-subtle text-sm mt-1 font-mono">A · AAAA · CNAME · MX · NS · PTR · SRV · SOA · TXT · CAA · DS · DNSKEY</p>
            </div>
          </div>
          <div className="px-5 pb-5">
            <HistoryTable history={history} onPick={pickHistory} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary bar */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg-default">
              <Globe className="w-3.5 h-3.5 text-accent-blue" />
              {result.target}
              {result.queriedName !== result.target && (
                <span className="text-fg-subtle font-mono font-normal">({result.queriedName})</span>
              )}
            </span>
            <span className="inline-flex items-center gap-1 text-fg-subtle font-mono">
              <Server className="w-3.5 h-3.5" /> {result.resolver}
            </span>
            {result.authoritative && (
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-accent-green/15 text-accent-green" title="Answer came from an authoritative name server (AA flag)">
                authoritative
              </span>
            )}
            <DnssecBadge dnssec={result.dnssec} />
            <div className="flex items-center gap-3 text-fg-subtle font-mono">
              <span className="text-accent-green">{totalRecords} record{totalRecords !== 1 ? 's' : ''}</span>
              <span className="opacity-40">|</span>
              <span>{(result.durationMs / 1000).toFixed(2)}s</span>
            </div>

            <label className="flex items-center gap-1.5 text-sm text-fg-muted cursor-pointer select-none">
              <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)}
                className="accent-accent-blue" />
              Hide empty types
            </label>

            <div className="ml-auto flex items-center gap-2">
              <CopyCommandMenu target={result.target} resolver={result.resolver} />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors outline-none">
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={4}
                    className="z-[200] min-w-[140px] p-1 rounded-lg bg-canvas-overlay border border-border-default shadow-2xl">
                    {(['csv', 'html', 'json'] as DnsExportFormat[]).map((fmt) => (
                      <DropdownMenu.Item key={fmt} className={menuItemCls}
                        onSelect={() => window.nmtrAPI.dnsExport({ result, format: fmt })}>
                        <Download className="w-3.5 h-3.5 text-fg-muted" /> {fmt.toUpperCase()}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className="my-1 h-px bg-border-default" />
                    <DropdownMenu.Item className={menuItemCls}
                      onSelect={() => window.nmtrAPI.dnsExport({ result, format: 'text' })}>
                      <Copy className="w-3.5 h-3.5 text-fg-muted" /> Copy as Text
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          <DiffStrip diff={result.diff} />

          {/* Record-type cards + history */}
          <div className="flex-1 overflow-y-auto p-5">
            {visibleSets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 text-fg-muted py-12">
                <p className="text-base">No records found for any type</p>
              </div>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                {visibleSets.map((set) => (
                  <RecordSetCard key={set.type} set={set} />
                ))}
              </div>
            )}
            <DnsDiagnostics result={result} />
            <HistoryTable history={history} onPick={pickHistory} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}
    </div>
  )
}
