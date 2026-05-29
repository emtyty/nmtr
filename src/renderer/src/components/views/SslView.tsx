import { useState, useEffect, useRef, useCallback } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Search, Square, RefreshCw, AlertCircle, Lock, Download, Copy, History, Trash2, X,
  ShieldCheck, ShieldAlert, Server, ChevronRight, Globe
} from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import {
  GradeBadge, CertificateCard, ChainList, ProtocolTable, CipherList, IssuesPanel, SslDiffStrip
} from './SslResultPanels'
import type {
  SslResolveResult,
  SslEndpoint,
  SslScanResult,
  SslScanRecord,
  SslExportFormat,
  SslScanProgressEvent,
  SslScanDoneEvent
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
  history: SslScanRecord[]
  onPick: (rec: SslScanRecord) => void
  onRescan: (rec: SslScanRecord) => void
  onClear: () => void
  onDelete: (id: string) => void
}): React.JSX.Element | null {
  if (history.length === 0) return null
  return (
    <div className="mt-6 border-t border-border-default pt-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <History className="w-3.5 h-3.5 text-fg-subtle" />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Scan history</span>
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
              <th className="px-3 py-2 font-semibold w-16 text-center">Grade</th>
              <th className="px-3 py-2 font-semibold">Host</th>
              <th className="px-3 py-2 font-semibold w-44">Endpoint</th>
              <th className="px-3 py-2 font-semibold">Cert expiry</th>
              <th className="px-2 py-2 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody>
            {history.map((rec) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Endpoint picker ──────────────────────────────────────────────────────────────

function EndpointPicker({ resolved, onPick }: { resolved: SslResolveResult; onPick: (ep: SslEndpoint) => void }): React.JSX.Element {
  return (
    <div className="max-w-2xl mx-auto w-full px-5 py-6">
      <div className="flex items-center gap-2 mb-3">
        <Server className="w-4 h-4 text-accent-blue" />
        <span className="text-[14px] font-semibold text-fg-default">
          {resolved.endpoints.length} endpoint{resolved.endpoints.length !== 1 ? 's' : ''} for {resolved.host}
        </span>
        <span className="text-[12px] text-fg-subtle">— pick one to scan</span>
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
  const [result, setResult] = useState<SslScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [history, setHistory] = useState<SslScanRecord[]>([])
  const scanIdRef = useRef<string | null>(null)

  const loadHistory = useCallback(() => {
    window.nmtrAPI.sslHistoryGet().then(setHistory).catch(() => {})
  }, [])
  useEffect(() => { loadHistory() }, [loadHistory])

  // Subscribe to streaming progress / completion.
  useEffect(() => {
    const offProgress = window.nmtrAPI.onSslProgress((e: SslScanProgressEvent) => {
      if (e.scanId !== scanIdRef.current) return
      if (e.percent !== null) setPercent(e.percent)
      if (e.message) setStatusMsg(e.message)
    })
    const offDone = window.nmtrAPI.onSslDone((e: SslScanDoneEvent) => {
      if (e.scanId !== scanIdRef.current) return
      scanIdRef.current = null
      setScanning(false)
      setPercent(null)
      if (e.result.error) {
        setError(e.result.error)
        setResult(null)
      } else {
        setError(null)
        setResult(e.result)
        loadHistory()
      }
    })
    return () => { offProgress(); offDone() }
  }, [loadHistory])

  const startScan = useCallback(async (scanHost: string, ep: SslEndpoint, scanPort: number) => {
    setResult(null)
    setError(null)
    setResolved(null)
    setScanning(true)
    setPercent(0)
    setStatusMsg('Starting…')
    try {
      const { scanId } = await window.nmtrAPI.sslScanStart({ config: { host: scanHost, ip: ep.ip, port: scanPort } })
      scanIdRef.current = scanId
    } catch (err) {
      setScanning(false)
      setPercent(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const resolve = useCallback(async (overrideHost?: string) => {
    const h = (overrideHost ?? host).trim()
    if (!h || resolving) return
    const p = parseInt(port, 10) || 443
    setResolving(true)
    setError(null)
    setResult(null)
    setResolved(null)
    try {
      const res = await window.nmtrAPI.sslResolve({ config: { host: h } })
      if (res.error) {
        setError(res.error)
      } else if (res.inputWasIp && res.endpoints.length === 1) {
        // IP literal → scan straight away.
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
    if (scanIdRef.current) window.nmtrAPI.sslScanCancel({ scanId: scanIdRef.current })
  }, [])

  const pickEndpoint = useCallback((ep: SslEndpoint) => {
    if (!resolved) return
    startScan(resolved.host, ep, parseInt(port, 10) || 443)
  }, [resolved, port, startScan])

  const pickHistory = useCallback((rec: SslScanRecord) => {
    setError(null)
    setResolved(null)
    setResult(rec.result)
    setHost(rec.host)
    setPort(String(rec.port))
  }, [])

  const rescanHistory = useCallback((rec: SslScanRecord) => {
    setHost(rec.host)
    setPort(String(rec.port))
    startScan(rec.host, { ip: rec.ip, family: rec.ip.includes(':') ? 6 : 4 }, rec.port)
  }, [startScan])

  const clearHistory = useCallback(() => {
    window.nmtrAPI.sslHistoryClear().then(() => setHistory([])).catch(() => {})
  }, [])

  const deleteHistory = useCallback((id: string) => {
    window.nmtrAPI.sslHistoryRemove(id).then(loadHistory).catch(() => {})
  }, [loadHistory])

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
              {statusMsg}{percent !== null ? ` · ${percent.toFixed(0)}%` : ''}
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
      {!scanning && !result && resolved && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <EndpointPicker resolved={resolved} onPick={pickEndpoint} />
          <div className="px-5 pb-5 max-w-2xl mx-auto w-full">
            <HistoryTable history={history} onPick={pickHistory} onRescan={rescanHistory} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!scanning && !result && !resolved && !error && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col items-center justify-center gap-4 text-center px-6 py-16">
            <Lock className="w-16 h-16 text-fg-subtle opacity-40" />
            <div>
              <p className="text-fg-subtle text-lg font-medium mb-1">SSL Scan</p>
              <p className="text-fg-muted text-base">Enter a host to resolve its IP endpoints, pick one, and audit its TLS configuration</p>
              <p className="text-fg-subtle text-sm mt-1 font-mono">protocols · cipher suites · certificate · trust · grade</p>
            </div>
          </div>
          <div className="px-5 pb-5 max-w-5xl mx-auto w-full">
            <HistoryTable history={history} onPick={pickHistory} onRescan={rescanHistory} onClear={clearHistory} onDelete={deleteHistory} />
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
                <Globe className="w-4 h-4 text-accent-blue" /> {result.host}
                <span className="text-fg-subtle font-mono font-normal text-[13px]">{result.ip}:{result.port}</span>
              </span>
              <span className="flex items-center gap-3 text-[12px] font-mono">
                <span className={`inline-flex items-center gap-1 ${result.chainTrusted ? 'text-accent-green' : 'text-accent-red'}`}>
                  {result.chainTrusted ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  {result.chainTrusted ? 'trusted' : 'not trusted'}
                </span>
                <span className={`inline-flex items-center gap-1 ${result.hostnameMatch ? 'text-accent-green' : 'text-accent-red'}`}>
                  {result.hostnameMatch ? 'hostname OK' : 'hostname mismatch'}
                </span>
                <span className="text-fg-subtle">{result.negotiatedProtocol ?? '—'}</span>
                <span className="text-fg-subtle opacity-40">|</span>
                <span className="text-fg-subtle">{(result.durationMs / 1000).toFixed(1)}s</span>
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
                    {(['csv', 'html', 'json'] as SslExportFormat[]).map((fmt) => (
                      <DropdownMenu.Item key={fmt} className={menuItemCls}
                        onSelect={() => window.nmtrAPI.sslExport({ result, format: fmt })}>
                        <Download className="w-3.5 h-3.5 text-fg-muted" /> {fmt.toUpperCase()}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className="my-1 h-px bg-border-default" />
                    <DropdownMenu.Item className={menuItemCls}
                      onSelect={() => window.nmtrAPI.sslExport({ result, format: 'text' })}>
                      <Copy className="w-3.5 h-3.5 text-fg-muted" /> Copy as Text
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          <SslDiffStrip diff={result.diff} />

          {/* Panels */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <IssuesPanel issues={result.issues} />
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] items-start">
              {result.certificate && <CertificateCard cert={result.certificate} />}
              <ProtocolTable protocols={result.protocols} />
            </div>
            <ChainList chain={result.chain} />
            <CipherList ciphers={result.ciphers} />
            <HistoryTable history={history} onPick={pickHistory} onRescan={rescanHistory} onClear={clearHistory} onDelete={deleteHistory} />
          </div>
        </div>
      )}
    </div>
  )
}
