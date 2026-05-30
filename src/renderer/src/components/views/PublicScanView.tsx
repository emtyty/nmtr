import { useState, useEffect, useRef, useCallback } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Search, Square, RefreshCw, AlertCircle, ShieldCheck, Download, Copy, History, Trash2, X, Globe
} from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { groupByKey, GroupToggle } from '../../lib/historyGroup'
import {
  GradeBadge, CategoryMatrix, FindingsPanel, HeadersPanel, CookiesPanel, CspPanel,
  TlsSummaryPanel, EmailPanel, TechPanel, ThirdPartyPanel, CompliancePanel, DiffStrip
} from './PublicScanPanels'
import type {
  PubScanResult,
  PubScanRecord,
  PubScanExportFormat,
  PubScanProgressEvent,
  PubScanDoneEvent
} from '@shared/types'

const menuItemCls =
  'flex items-center gap-2 px-3 py-1.5 text-sm text-fg-default rounded cursor-pointer outline-none data-[highlighted]:bg-canvas-hover'

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
}

// ── Scan history ───────────────────────────────────────────────────────────────

function HistoryTable({
  history, onPick, onRescan, onClear, onDelete
}: {
  history: PubScanRecord[]
  onPick: (rec: PubScanRecord) => void
  onRescan: (rec: PubScanRecord) => void
  onClear: () => void
  onDelete: (id: string) => void
}): React.JSX.Element | null {
  const [grouped, setGrouped] = useState(false)
  if (history.length === 0) return null

  const COLS = 5
  const renderRow = (rec: PubScanRecord): React.JSX.Element => (
    <tr key={rec.id} onClick={() => onPick(rec)} title="Load this result"
      className="border-b border-border-muted/40 last:border-0 hover:bg-canvas-hover/60 cursor-pointer group">
      <td className="px-3 py-1.5 text-fg-muted whitespace-nowrap">{formatWhen(rec.scannedAt)}</td>
      <td className="px-3 py-1.5 text-center"><GradeBadge grade={rec.grade} size="sm" /></td>
      <td className="px-3 py-1.5 font-mono text-fg-default break-all">{rec.domain}</td>
      <td className="px-3 py-1.5 text-center font-mono text-fg-subtle">{rec.findingCount}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <button onClick={(e) => { e.stopPropagation(); onRescan(rec) }} title="Rescan"
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
              <th className="px-3 py-2 font-semibold">Domain</th>
              <th className="px-3 py-2 font-semibold w-24 text-center">Findings</th>
              <th className="px-2 py-2 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody>
            {grouped
              ? groupByKey(history, (r) => r.domain).flatMap((g) => [
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

// ── Main view ────────────────────────────────────────────────────────────────────

export function PublicScanView(): React.JSX.Element {
  const prefill = useUIStore((s) => s.pubScanPrefill)
  const clearPrefill = useUIStore((s) => s.clearPubScanPrefill)

  const [url, setUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [percent, setPercent] = useState<number | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [result, setResult] = useState<PubScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<PubScanRecord[]>([])

  const scanIdRef = useRef<string | null>(null)
  const pendingRef = useRef<((r: PubScanResult) => void) | null>(null)

  const loadHistory = useCallback(() => {
    window.nmtrAPI.pubScanHistoryGet().then(setHistory).catch(() => {})
  }, [])
  useEffect(() => { loadHistory() }, [loadHistory])

  // Subscribe to streaming progress / completion.
  useEffect(() => {
    const offProgress = window.nmtrAPI.onPubScanProgress((e: PubScanProgressEvent) => {
      if (e.scanId !== scanIdRef.current) return
      if (e.percent !== null) setPercent(e.percent)
      if (e.message) setStatusMsg(e.message)
    })
    const offDone = window.nmtrAPI.onPubScanDone((e: PubScanDoneEvent) => {
      if (e.scanId !== scanIdRef.current) return
      scanIdRef.current = null
      const resolve = pendingRef.current
      pendingRef.current = null
      resolve?.(e.result)
    })
    return () => { offProgress(); offDone() }
  }, [])

  const runScan = useCallback((target: string): Promise<PubScanResult> => {
    return new Promise((resolve, reject) => {
      pendingRef.current = resolve
      window.nmtrAPI.pubScanStart({ config: { url: target } })
        .then(({ scanId }: { scanId: string }) => { scanIdRef.current = scanId })
        .catch((err: unknown) => { pendingRef.current = null; reject(err) })
    })
  }, [])

  const startScan = useCallback(async (target: string) => {
    const t = target.trim()
    if (!t || scanning) return
    setResult(null); setError(null)
    setScanning(true); setPercent(0); setStatusMsg('Starting…')
    try {
      const res = await runScan(t)
      setScanning(false); setPercent(null)
      if (res.error) { setError(res.error); setResult(null) }
      else { setResult(res); loadHistory() }
    } catch (err) {
      setScanning(false); setPercent(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [scanning, runScan, loadHistory])

  // Consume a prefilled target from another view.
  useEffect(() => {
    if (prefill) {
      setUrl(prefill)
      clearPrefill()
      void startScan(prefill)
    }
  }, [prefill, clearPrefill, startScan])

  const cancelScan = useCallback(() => {
    if (scanIdRef.current) window.nmtrAPI.pubScanCancel({ scanId: scanIdRef.current })
  }, [])

  const pickHistory = useCallback((rec: PubScanRecord) => {
    setError(null)
    setResult(rec.result); setUrl(rec.url)
  }, [])

  const clearHistory = useCallback(() => {
    window.nmtrAPI.pubScanHistoryClear().then(() => setHistory([])).catch(() => {})
  }, [])

  const deleteHistory = useCallback((id: string) => {
    window.nmtrAPI.pubScanHistoryRemove(id).then(loadHistory).catch(() => {})
  }, [loadHistory])

  return (
    <div className="flex-1 flex flex-col bg-canvas-default overflow-hidden">
      {/* ── Controls bar ── */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') startScan(url) }}
          placeholder="Domain or URL (e.g. example.com)"
          spellCheck={false}
          disabled={scanning}
          className="flex-1 min-w-[260px] px-3 py-1.5 text-base font-mono rounded-md bg-canvas-default border border-border-default text-fg-default placeholder:text-fg-subtle focus:outline-none focus:border-accent-blue disabled:opacity-60"
        />
        {!scanning ? (
          <button onClick={() => startScan(url)} disabled={!url.trim()}
            className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-base font-semibold rounded-md bg-accent-blue text-canvas-default hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
            <Search className="w-4 h-4" /> Scan
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
            <span className="text-xs font-mono text-fg-muted">{statusMsg}{percent !== null ? ` · ${percent.toFixed(0)}%` : ''}</span>
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

      {/* ── Empty state ── */}
      {!scanning && !result && !error && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col items-center justify-center gap-4 text-center px-6 py-16">
            <ShieldCheck className="w-16 h-16 text-fg-subtle opacity-40" />
            <div>
              <p className="text-fg-subtle text-lg font-medium mb-1">Public Scan</p>
              <p className="text-fg-muted text-base">Enter a public domain or URL to run a passive web-security test and get an A+→F grade</p>
              <p className="text-fg-subtle text-sm mt-1 font-mono">headers · cookies · CSP · TLS · DNS/email · software · trackers · GDPR/PCI/NIST</p>
            </div>
          </div>
          <div className="px-5 pb-5 max-w-5xl mx-auto w-full">
            <HistoryTable history={history} onPick={pickHistory} onRescan={(r) => startScan(r.url)} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {result && !scanning && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Summary bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap">
            <GradeBadge grade={result.grade} />
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 font-semibold text-fg-default text-[15px]">
                <Globe className="w-4 h-4 text-accent-blue" /> {result.domain}
                <span className="text-fg-subtle font-mono font-normal text-[13px]">{result.finalUrl}</span>
              </span>
              <span className="flex items-center gap-3 text-[12px] font-mono flex-wrap text-fg-subtle">
                <span>score {result.score}/100</span>
                <span className="opacity-40">|</span>
                <span>{result.findings.length} finding{result.findings.length !== 1 ? 's' : ''}</span>
                {result.ip && <><span className="opacity-40">|</span><span>{result.ip}</span></>}
                {result.statusCode !== null && <><span className="opacity-40">|</span><span>HTTP {result.statusCode}</span></>}
                <span className="opacity-40">|</span>
                <span>{(result.durationMs / 1000).toFixed(1)}s</span>
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors outline-none">
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={4}
                    className="z-[200] min-w-[140px] p-1 rounded-lg bg-canvas-overlay border border-border-default shadow-2xl">
                    {(['csv', 'html', 'json'] as PubScanExportFormat[]).map((fmt) => (
                      <DropdownMenu.Item key={fmt} className={menuItemCls}
                        onSelect={() => window.nmtrAPI.pubScanExport({ result, format: fmt })}>
                        <Download className="w-3.5 h-3.5 text-fg-muted" /> {fmt.toUpperCase()}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className="my-1 h-px bg-border-default" />
                    <DropdownMenu.Item className={menuItemCls}
                      onSelect={() => window.nmtrAPI.pubScanExport({ result, format: 'text' })}>
                      <Copy className="w-3.5 h-3.5 text-fg-muted" /> Copy as Text
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          <DiffStrip diff={result.diff} />

          {/* Panels */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <CategoryMatrix grades={result.categoryGrades} />
            <FindingsPanel findings={result.findings} />
            <CompliancePanel items={result.compliance} />
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] items-start">
              <TlsSummaryPanel tls={result.tls} />
              <EmailPanel email={result.email} />
            </div>
            <HeadersPanel headers={result.headers} />
            <CspPanel csp={result.csp} />
            <CookiesPanel cookies={result.cookies} />
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] items-start">
              <TechPanel tech={result.tech} />
              <ThirdPartyPanel items={result.thirdParty} />
            </div>
            <HistoryTable history={history} onPick={pickHistory} onRescan={(r) => startScan(r.url)} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}
    </div>
  )
}
