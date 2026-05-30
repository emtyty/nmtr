import { useState, useEffect, useRef, useCallback } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Search, Square, RefreshCw, AlertCircle, Lock, Download, Copy, History, Trash2, X,
  ShieldCheck, ShieldAlert, Server, ChevronRight, Globe, Layers, Star, Eye
} from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { groupByKey, GroupToggle } from '../../lib/historyGroup'
import {
  GradeBadge, CertificateCard, ChainList, ProtocolTable, CipherList, IssuesPanel,
  SslDiffStrip, OcspBadge, SecurityHeadersPanel
} from './SslResultPanels'
import type {
  SslResolveResult,
  SslEndpoint,
  SslScanResult,
  SslScanRecord,
  SslWatchEntry,
  SslExportFormat,
  SslScanProgressEvent,
  SslScanDoneEvent
} from '@shared/types'

const menuItemCls =
  'flex items-center gap-2 px-3 py-1.5 text-sm text-fg-default rounded cursor-pointer outline-none data-[highlighted]:bg-canvas-hover'

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
}

/** Days until an ISO expiry date (negative if already past). */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  if (isNaN(ms)) return null
  return Math.floor((ms - Date.now()) / 86_400_000)
}

function expiryColor(days: number | null): string {
  if (days === null) return 'text-fg-subtle'
  if (days < 0) return 'text-accent-red'
  if (days <= 21) return 'text-accent-yellow'
  return 'text-accent-green'
}

// ── Scan history ───────────────────────────────────────────────────────────────

function HistoryTable({
  history, onPick, onRescan, onClear, onDelete
}: {
  history: SslScanRecord[]
  onPick: (rec: SslScanRecord) => void
  onRescan: (rec: SslScanRecord) => void
  onClear: () => void
  onDelete: (id: string) => void
}): React.JSX.Element | null {
  const [grouped, setGrouped] = useState(false)
  if (history.length === 0) return null

  const COLS = 6
  const renderRow = (rec: SslScanRecord): React.JSX.Element => (
    <tr key={rec.id} onClick={() => onPick(rec)} title="Load this result"
      className="border-b border-border-muted/40 last:border-0 hover:bg-canvas-hover/60 cursor-pointer group">
      <td className="px-3 py-1.5 text-fg-muted whitespace-nowrap">{formatWhen(rec.scannedAt)}</td>
      <td className="px-3 py-1.5 text-center"><GradeBadge grade={rec.grade} size="sm" /></td>
      <td className="px-3 py-1.5 font-mono text-fg-default break-all">{rec.host}</td>
      <td className="px-3 py-1.5 font-mono text-fg-subtle">{rec.ip}:{rec.port}</td>
      <td className="px-3 py-1.5 text-fg-muted whitespace-nowrap">
        {rec.certValidTo ? new Date(rec.certValidTo).toLocaleDateString() : '—'}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <button onClick={(e) => { e.stopPropagation(); onRescan(rec) }} title="Rescan this endpoint"
          className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-accent-blue hover:bg-canvas-hover transition-all">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(rec.id) }} title="Delete this entry"
          className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-accent-red hover:bg-canvas-hover transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )

  return (
    <div className="mt-6 border-t border-border-default pt-4">
      <div className="flex items-center gap-3 mb-2 px-1">
        <History className="w-3.5 h-3.5 text-fg-subtle" />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Scan history</span>
        <span className="text-[12px] font-mono text-fg-subtle">{history.length}</span>
        <GroupToggle grouped={grouped} onToggle={() => setGrouped((g) => !g)} />
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
              <th className="px-3 py-2 font-semibold w-16 text-center">Grade</th>
              <th className="px-3 py-2 font-semibold">Host</th>
              <th className="px-3 py-2 font-semibold w-44">Endpoint</th>
              <th className="px-3 py-2 font-semibold">Cert expiry</th>
              <th className="px-2 py-2 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody>
            {grouped
              ? groupByKey(history, (r) => r.host).flatMap((g) => [
                  <tr key={`h-${g.key}`} className="bg-canvas-subtle/70 border-b border-border-muted">
                    <td colSpan={COLS} className="px-3 py-1 text-[11.5px] font-mono font-semibold text-fg-muted">
                      {g.key} <span className="text-fg-subtle">· {g.items.length}</span>
                    </td>
                  </tr>,
                  ...g.items.map(renderRow)
                ])
              : history.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Expiry watchlist ──────────────────────────────────────────────────────────

function WatchlistPanel({
  watchlist, onRecheck, onRemove
}: {
  watchlist: SslWatchEntry[]
  onRecheck: (w: SslWatchEntry) => void
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  if (watchlist.length === 0) return null
  // Soonest-to-expire first; never-scanned entries sink to the bottom.
  const sorted = [...watchlist].sort((a, b) => {
    const da = daysUntil(a.certValidTo)
    const db = daysUntil(b.certValidTo)
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  })
  return (
    <div className="mt-6 border-t border-border-default pt-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Eye className="w-3.5 h-3.5 text-accent-blue" />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Expiry watchlist</span>
        <span className="text-[12px] font-mono text-fg-subtle">{watchlist.length}</span>
      </div>
      <div className="border border-border-default rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-canvas-inset">
            <tr className="text-fg-subtle text-left border-b border-border-muted">
              <th className="px-3 py-2 font-semibold w-16 text-center">Grade</th>
              <th className="px-3 py-2 font-semibold">Host</th>
              <th className="px-3 py-2 font-semibold w-44">Endpoint</th>
              <th className="px-3 py-2 font-semibold">Expires</th>
              <th className="px-3 py-2 font-semibold">Last checked</th>
              <th className="px-2 py-2 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w) => {
              const days = daysUntil(w.certValidTo)
              return (
                <tr key={w.id} className="border-b border-border-muted/40 last:border-0 hover:bg-canvas-hover/60 group">
                  <td className="px-3 py-1.5 text-center">
                    {w.lastGrade ? <GradeBadge grade={w.lastGrade} size="sm" /> : <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-fg-default break-all">{w.host}</td>
                  <td className="px-3 py-1.5 font-mono text-fg-subtle">{w.ip}:{w.port}</td>
                  <td className={`px-3 py-1.5 whitespace-nowrap font-mono ${expiryColor(days)}`}>
                    {w.certValidTo
                      ? <>{new Date(w.certValidTo).toLocaleDateString()} <span className="opacity-80">({days !== null && days < 0 ? 'expired' : `${days}d`})</span></>
                      : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-fg-muted whitespace-nowrap">
                    {w.lastScannedAt ? formatWhen(w.lastScannedAt) : 'never'}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => onRecheck(w)} title="Re-check now"
                      className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-accent-blue hover:bg-canvas-hover transition-all">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onRemove(w.id)} title="Stop watching"
                      className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-accent-red hover:bg-canvas-hover transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Endpoint picker ──────────────────────────────────────────────────────────────

function EndpointPicker({
  resolved, onPick, onScanAll
}: {
  resolved: SslResolveResult
  onPick: (ep: SslEndpoint) => void
  onScanAll: () => void
}): React.JSX.Element {
  return (
    <div className="max-w-2xl mx-auto w-full px-5 py-6">
      <div className="flex items-center gap-2 mb-3">
        <Server className="w-4 h-4 text-accent-blue" />
        <span className="text-[14px] font-semibold text-fg-default">
          {resolved.endpoints.length} endpoint{resolved.endpoints.length !== 1 ? 's' : ''} for {resolved.host}
        </span>
        <span className="text-[12px] text-fg-subtle">— pick one to scan</span>
        {resolved.endpoints.length > 1 && (
          <button onClick={onScanAll} title="Scan every endpoint and compare"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 text-[13px] font-semibold rounded-md bg-accent-blue text-canvas-default hover:opacity-90 transition-opacity">
            <Layers className="w-3.5 h-3.5" /> Scan all {resolved.endpoints.length}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {resolved.endpoints.map((ep) => (
          <button key={ep.ip} onClick={() => onPick(ep)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border-default bg-canvas-inset hover:border-accent-blue hover:bg-canvas-hover/40 transition-colors text-left group">
            <Lock className="w-4 h-4 text-fg-subtle group-hover:text-accent-blue" />
            <span className="font-mono text-[14px] text-fg-default">{ep.ip}</span>
            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-accent-blue/10 text-accent-blue">IPv{ep.family}</span>
            <ChevronRight className="w-4 h-4 text-fg-subtle ml-auto group-hover:text-accent-blue" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Multi-endpoint comparison strip ──────────────────────────────────────────────

function enabledProtos(r: SslScanResult): string {
  return r.protocols.filter((p) => p.support === 'enabled').map((p) => p.protocol.replace('TLSv', '')).join(' ') || '—'
}

function EndpointComparison({
  results, activeIdx, onSelect
}: {
  results: SslScanResult[]
  activeIdx: number
  onSelect: (i: number) => void
}): React.JSX.Element {
  // Flag the columns that diverge across endpoints — that's the whole point of scanning them all.
  const grades = new Set(results.map((r) => r.grade))
  const protoSets = new Set(results.map((r) => enabledProtos(r)))
  const fps = new Set(results.map((r) => r.certificate?.sha256Fingerprint ?? ''))
  const anyDiff = grades.size > 1 || protoSets.size > 1 || fps.size > 1
  return (
    <div className="border-b border-border-default bg-canvas-subtle flex-shrink-0">
      <div className="flex items-center gap-2 px-5 pt-3 pb-1">
        <Layers className="w-4 h-4 text-accent-blue" />
        <span className="text-[13px] font-semibold text-fg-default">{results.length} endpoints</span>
        {anyDiff
          ? <span className="inline-flex items-center gap-1 text-[12px] text-accent-yellow"><ShieldAlert className="w-3.5 h-3.5" /> configurations differ</span>
          : <span className="text-[12px] text-accent-green">identical configuration</span>}
      </div>
      <div className="px-3 pb-2 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-fg-subtle text-left">
              <th className="px-2 py-1 font-semibold w-14 text-center">Grade</th>
              <th className="px-2 py-1 font-semibold">Endpoint</th>
              <th className={`px-2 py-1 font-semibold ${protoSets.size > 1 ? 'text-accent-yellow' : ''}`}>Protocols</th>
              <th className="px-2 py-1 font-semibold">Expiry</th>
              <th className={`px-2 py-1 font-semibold ${fps.size > 1 ? 'text-accent-yellow' : ''}`}>Cert</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const days = daysUntil(r.certificate?.validTo ?? null)
              const fp = r.certificate?.sha256Fingerprint ?? ''
              return (
                <tr key={`${r.ip}:${r.port}`} onClick={() => onSelect(i)}
                  className={`cursor-pointer border-t border-border-muted/40 ${i === activeIdx ? 'bg-canvas-hover/70' : 'hover:bg-canvas-hover/40'}`}>
                  <td className="px-2 py-1.5 text-center"><GradeBadge grade={r.grade} size="sm" /></td>
                  <td className="px-2 py-1.5 font-mono text-fg-default">{r.ip}:{r.port}</td>
                  <td className={`px-2 py-1.5 font-mono ${protoSets.size > 1 ? 'text-accent-yellow' : 'text-fg-muted'}`}>{enabledProtos(r)}</td>
                  <td className={`px-2 py-1.5 font-mono ${expiryColor(days)}`}>{days !== null ? (days < 0 ? 'expired' : `${days}d`) : '—'}</td>
                  <td className="px-2 py-1.5 font-mono text-fg-subtle">{fp ? fp.replace(/:/g, '').slice(0, 12) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────────

export function SslView(): React.JSX.Element {
  const prefill = useUIStore((s) => s.sslPrefill)
  const clearPrefill = useUIStore((s) => s.clearSslPrefill)

  const [host, setHost] = useState('')
  const [port, setPort] = useState('443')

  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<SslResolveResult | null>(null)

  const [scanning, setScanning] = useState(false)
  const [percent, setPercent] = useState<number | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [batch, setBatch] = useState<{ idx: number; total: number } | null>(null)
  const [result, setResult] = useState<SslScanResult | null>(null)
  const [multiResults, setMultiResults] = useState<SslScanResult[] | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [history, setHistory] = useState<SslScanRecord[]>([])
  const [watchlist, setWatchlist] = useState<SslWatchEntry[]>([])
  const scanIdRef = useRef<string | null>(null)
  const pendingRef = useRef<((r: SslScanResult) => void) | null>(null)
  const cancelAllRef = useRef(false)

  const loadHistory = useCallback(() => {
    window.nmtrAPI.sslHistoryGet().then(setHistory).catch(() => {})
  }, [])
  const loadWatch = useCallback(() => {
    window.nmtrAPI.sslWatchGet().then(setWatchlist).catch(() => {})
  }, [])
  useEffect(() => { loadHistory(); loadWatch() }, [loadHistory, loadWatch])

  // Subscribe to streaming progress / completion. Done events resolve the
  // promise the active scan is awaiting (see runScan), so single- and multi-
  // endpoint flows share one primitive.
  useEffect(() => {
    const offProgress = window.nmtrAPI.onSslProgress((e: SslScanProgressEvent) => {
      if (e.scanId !== scanIdRef.current) return
      if (e.percent !== null) setPercent(e.percent)
      if (e.message) setStatusMsg(e.message)
    })
    const offDone = window.nmtrAPI.onSslDone((e: SslScanDoneEvent) => {
      if (e.scanId !== scanIdRef.current) return
      scanIdRef.current = null
      const resolve = pendingRef.current
      pendingRef.current = null
      resolve?.(e.result)
    })
    return () => { offProgress(); offDone() }
  }, [])

  /** Run one scan and resolve when its SSL_DONE arrives. */
  const runScan = useCallback((scanHost: string, ep: SslEndpoint, scanPort: number): Promise<SslScanResult> => {
    return new Promise((resolve, reject) => {
      pendingRef.current = resolve
      window.nmtrAPI.sslScanStart({ config: { host: scanHost, ip: ep.ip, port: scanPort } })
        .then(({ scanId }: { scanId: string }) => { scanIdRef.current = scanId })
        .catch((err: unknown) => { pendingRef.current = null; reject(err) })
    })
  }, [])

  const startScan = useCallback(async (scanHost: string, ep: SslEndpoint, scanPort: number) => {
    setResult(null); setMultiResults(null); setError(null); setResolved(null)
    setScanning(true); setPercent(0); setBatch(null); setStatusMsg('Starting…')
    try {
      const res = await runScan(scanHost, ep, scanPort)
      setScanning(false); setPercent(null)
      if (res.error) { setError(res.error); setResult(null) }
      else { setResult(res); loadHistory(); loadWatch() }
    } catch (err) {
      setScanning(false); setPercent(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [runScan, loadHistory, loadWatch])

  const startScanAll = useCallback(async (scanHost: string, endpoints: SslEndpoint[], scanPort: number) => {
    setResult(null); setMultiResults(null); setError(null); setResolved(null)
    setScanning(true); setPercent(0); setStatusMsg('Starting…')
    cancelAllRef.current = false
    const collected: SslScanResult[] = []
    try {
      for (let i = 0; i < endpoints.length; i++) {
        if (cancelAllRef.current) break
        setBatch({ idx: i + 1, total: endpoints.length })
        setPercent(0)
        const res = await runScan(scanHost, endpoints[i], scanPort)
        collected.push(res)
      }
      setScanning(false); setPercent(null); setBatch(null)
      const ok = collected.filter((r) => !r.error)
      if (ok.length === 0) setError(collected[0]?.error ?? 'All endpoint scans failed.')
      else if (ok.length === 1) setResult(ok[0])
      else { setMultiResults(ok); setActiveIdx(0) }
      loadHistory(); loadWatch()
    } catch (err) {
      setScanning(false); setPercent(null); setBatch(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [runScan, loadHistory, loadWatch])

  const resolve = useCallback(async (overrideHost?: string) => {
    const h = (overrideHost ?? host).trim()
    if (!h || resolving) return
    const p = parseInt(port, 10) || 443
    setResolving(true)
    setError(null); setResult(null); setMultiResults(null); setResolved(null)
    try {
      const res = await window.nmtrAPI.sslResolve({ config: { host: h } })
      if (res.error) {
        setError(res.error)
      } else if (res.inputWasIp && res.endpoints.length === 1) {
        startScan(res.host, res.endpoints[0], p)
      } else {
        setResolved(res)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResolving(false)
    }
  }, [host, port, resolving, startScan])

  // Consume a prefilled host from another view.
  useEffect(() => {
    if (prefill) {
      setHost(prefill)
      clearPrefill()
      void resolve(prefill)
    }
  }, [prefill, clearPrefill, resolve])

  const cancelScan = useCallback(() => {
    cancelAllRef.current = true
    if (scanIdRef.current) window.nmtrAPI.sslScanCancel({ scanId: scanIdRef.current })
  }, [])

  const pickEndpoint = useCallback((ep: SslEndpoint) => {
    if (!resolved) return
    startScan(resolved.host, ep, parseInt(port, 10) || 443)
  }, [resolved, port, startScan])

  const scanAll = useCallback(() => {
    if (!resolved) return
    startScanAll(resolved.host, resolved.endpoints, parseInt(port, 10) || 443)
  }, [resolved, port, startScanAll])

  const pickHistory = useCallback((rec: SslScanRecord) => {
    setError(null); setResolved(null); setMultiResults(null)
    setResult(rec.result); setHost(rec.host); setPort(String(rec.port))
  }, [])

  const rescanEndpoint = useCallback((host: string, ip: string, port: number) => {
    setHost(host); setPort(String(port))
    startScan(host, { ip, family: ip.includes(':') ? 6 : 4 }, port)
  }, [startScan])

  const clearHistory = useCallback(() => {
    window.nmtrAPI.sslHistoryClear().then(() => setHistory([])).catch(() => {})
  }, [])

  const deleteHistory = useCallback((id: string) => {
    window.nmtrAPI.sslHistoryRemove(id).then(loadHistory).catch(() => {})
  }, [loadHistory])

  // Watchlist actions.
  const isWatched = useCallback((r: SslScanResult): boolean =>
    watchlist.some((w) => w.host === r.host && w.ip === r.ip && w.port === r.port), [watchlist])

  const toggleWatch = useCallback((r: SslScanResult) => {
    const existing = watchlist.find((w) => w.host === r.host && w.ip === r.ip && w.port === r.port)
    const p = existing
      ? window.nmtrAPI.sslWatchRemove(existing.id)
      : window.nmtrAPI.sslWatchAdd({ host: r.host, ip: r.ip, port: r.port })
    p.then(setWatchlist).catch(() => {})
  }, [watchlist])

  const recheckWatch = useCallback((w: SslWatchEntry) => {
    rescanEndpoint(w.host, w.ip, w.port)
  }, [rescanEndpoint])

  const removeWatch = useCallback((id: string) => {
    window.nmtrAPI.sslWatchRemove(id).then(setWatchlist).catch(() => {})
  }, [])

  // The result currently in focus (single scan, or the selected endpoint of a batch).
  const active: SslScanResult | null = multiResults ? (multiResults[activeIdx] ?? null) : result

  return (
    <div className="flex-1 flex flex-col bg-canvas-default overflow-hidden">
      {/* ── Controls bar ── */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') resolve() }}
          placeholder="Host, URL, or IP (e.g. example.com)"
          spellCheck={false}
          disabled={resolving || scanning}
          className="flex-1 min-w-[220px] px-3 py-1.5 text-base font-mono rounded-md bg-canvas-default border border-border-default text-fg-default placeholder:text-fg-subtle focus:outline-none focus:border-accent-blue disabled:opacity-60"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-fg-subtle">Port</span>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') resolve() }}
            disabled={resolving || scanning}
            className="w-20 px-2 py-1.5 text-sm font-mono rounded-md bg-canvas-default border border-border-default text-fg-default focus:outline-none focus:border-accent-blue disabled:opacity-60"
          />
        </div>

        {!scanning ? (
          <button onClick={() => resolve()} disabled={!host.trim() || resolving}
            className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-base font-semibold rounded-md bg-accent-blue text-canvas-default hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
            {resolving
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Resolving…</>
              : <><Search className="w-4 h-4" /> Resolve</>}
          </button>
        ) : (
          <button onClick={cancelScan}
            className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-base font-semibold rounded-md border border-border-default text-fg-default hover:bg-canvas-hover transition-colors">
            <Square className="w-4 h-4" /> Cancel
          </button>
        )}
      </div>

      {/* ── Progress bar ── */}
      {scanning && (
        <div className="px-5 py-2 border-b border-border-default bg-canvas-subtle flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-fg-muted">
              {batch ? `Endpoint ${batch.idx}/${batch.total} · ` : ''}{statusMsg}{percent !== null ? ` · ${percent.toFixed(0)}%` : ''}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-canvas-inset overflow-hidden">
            <div className="h-full bg-accent-blue transition-all duration-300" style={{ width: `${percent ?? 5}%` }} />
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mx-5 mt-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg flex items-start gap-3 text-accent-red">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-base font-mono opacity-90">{error}</p>
        </div>
      )}

      {/* ── Endpoint picker ── */}
      {!scanning && !active && resolved && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <EndpointPicker resolved={resolved} onPick={pickEndpoint} onScanAll={scanAll} />
          <div className="px-5 pb-5 max-w-2xl mx-auto w-full">
            <WatchlistPanel watchlist={watchlist} onRecheck={recheckWatch} onRemove={removeWatch} />
            <HistoryTable history={history} onPick={pickHistory} onRescan={(r) => rescanEndpoint(r.host, r.ip, r.port)} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!scanning && !active && !resolved && !error && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col items-center justify-center gap-4 text-center px-6 py-16">
            <Lock className="w-16 h-16 text-fg-subtle opacity-40" />
            <div>
              <p className="text-fg-subtle text-lg font-medium mb-1">SSL Scan</p>
              <p className="text-fg-muted text-base">Enter a host to resolve its IP endpoints, pick one (or scan all), and audit its TLS configuration</p>
              <p className="text-fg-subtle text-sm mt-1 font-mono">protocols · ciphers · certificate · trust · revocation · HSTS · grade</p>
            </div>
          </div>
          <div className="px-5 pb-5 max-w-5xl mx-auto w-full">
            <WatchlistPanel watchlist={watchlist} onRecheck={recheckWatch} onRemove={removeWatch} />
            <HistoryTable history={history} onPick={pickHistory} onRescan={(r) => rescanEndpoint(r.host, r.ip, r.port)} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {active && !scanning && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Multi-endpoint comparison */}
          {multiResults && multiResults.length > 1 && (
            <EndpointComparison results={multiResults} activeIdx={activeIdx} onSelect={setActiveIdx} />
          )}

          {/* Summary bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap">
            <GradeBadge grade={active.grade} />
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 font-semibold text-fg-default text-[15px]">
                <Globe className="w-4 h-4 text-accent-blue" /> {active.host}
                <span className="text-fg-subtle font-mono font-normal text-[13px]">{active.ip}:{active.port}</span>
              </span>
              <span className="flex items-center gap-3 text-[12px] font-mono flex-wrap">
                <span className={`inline-flex items-center gap-1 ${active.chainTrusted ? 'text-accent-green' : 'text-accent-red'}`}>
                  {active.chainTrusted ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  {active.chainTrusted ? 'trusted' : 'not trusted'}
                </span>
                <span className={`inline-flex items-center gap-1 ${active.hostnameMatch ? 'text-accent-green' : 'text-accent-red'}`}>
                  {active.hostnameMatch ? 'hostname OK' : 'hostname mismatch'}
                </span>
                <OcspBadge ocsp={active.ocsp} />
                <span className="text-fg-subtle">{active.negotiatedProtocol ?? '—'}</span>
                <span className="text-fg-subtle opacity-40">|</span>
                <span className="text-fg-subtle">{(active.durationMs / 1000).toFixed(1)}s</span>
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => toggleWatch(active)}
                title={isWatched(active) ? 'Stop watching this endpoint' : 'Watch for expiry / config drift'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors outline-none ${
                  isWatched(active)
                    ? 'border-accent-yellow/40 text-accent-yellow bg-accent-yellow/10'
                    : 'border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover'
                }`}>
                <Star className={`w-3.5 h-3.5 ${isWatched(active) ? 'fill-current' : ''}`} />
                {isWatched(active) ? 'Watching' : 'Watch'}
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors outline-none">
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={4}
                    className="z-[200] min-w-[140px] p-1 rounded-lg bg-canvas-overlay border border-border-default shadow-2xl">
                    {(['csv', 'html', 'json'] as SslExportFormat[]).map((fmt) => (
                      <DropdownMenu.Item key={fmt} className={menuItemCls}
                        onSelect={() => window.nmtrAPI.sslExport({ result: active, format: fmt })}>
                        <Download className="w-3.5 h-3.5 text-fg-muted" /> {fmt.toUpperCase()}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className="my-1 h-px bg-border-default" />
                    <DropdownMenu.Item className={menuItemCls}
                      onSelect={() => window.nmtrAPI.sslExport({ result: active, format: 'text' })}>
                      <Copy className="w-3.5 h-3.5 text-fg-muted" /> Copy as Text
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          <SslDiffStrip diff={active.diff} />

          {/* Panels */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <IssuesPanel issues={active.issues} />
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] items-start">
              {active.certificate && <CertificateCard cert={active.certificate} />}
              <ProtocolTable protocols={active.protocols} />
            </div>
            <SecurityHeadersPanel headers={active.securityHeaders} />
            <ChainList chain={active.chain} />
            <CipherList ciphers={active.ciphers} />
            <WatchlistPanel watchlist={watchlist} onRecheck={recheckWatch} onRemove={removeWatch} />
            <HistoryTable history={history} onPick={pickHistory} onRescan={(r) => rescanEndpoint(r.host, r.ip, r.port)} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}
    </div>
  )
}
