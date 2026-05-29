import { useState, useEffect, useRef, useCallback } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Search, Square, RefreshCw, AlertCircle, ShieldAlert, ExternalLink, Server, CheckCircle2,
  Download, Copy, Globe, Crosshair, MoreVertical, Terminal, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import type {
  PortScanConfig,
  PortScanPreset,
  PortScanProtocol,
  PortScanResult,
  PortInfo,
  PortState,
  NmapCheckResult,
  PortScanExportFormat,
  PortScanProgressEvent,
  PortScanDoneEvent
} from '@shared/types'

const PRESET_LABELS: Record<PortScanPreset, string> = {
  top100: 'Top 100 ports',
  top1000: 'Top 1000 ports',
  all: 'All 65535 ports',
  custom: 'Custom range'
}

// ── Risk flagging ────────────────────────────────────────────────────────────

type RiskLevel = 'high' | 'medium' | 'info'
interface Risk { level: RiskLevel; note: string }

const RISKY_PORTS: Record<number, Risk> = {
  21: { level: 'high', note: 'FTP — credentials sent in cleartext' },
  23: { level: 'high', note: 'Telnet — unencrypted remote shell' },
  25: { level: 'medium', note: 'SMTP — open relay / spoofing risk if misconfigured' },
  69: { level: 'medium', note: 'TFTP — no authentication' },
  110: { level: 'medium', note: 'POP3 — cleartext mail retrieval' },
  111: { level: 'medium', note: 'RPCbind — info disclosure / amplification' },
  135: { level: 'high', note: 'MSRPC — common Windows attack surface' },
  139: { level: 'high', note: 'NetBIOS — legacy SMB, worm target' },
  143: { level: 'medium', note: 'IMAP — cleartext mail access' },
  161: { level: 'medium', note: 'SNMP — info disclosure via default community' },
  389: { level: 'medium', note: 'LDAP — directory exposure' },
  445: { level: 'high', note: 'SMB — EternalBlue / ransomware target' },
  512: { level: 'high', note: 'rexec — legacy unauthenticated service' },
  513: { level: 'high', note: 'rlogin — legacy unauthenticated service' },
  514: { level: 'high', note: 'rsh / syslog — legacy unauthenticated service' },
  1433: { level: 'high', note: 'MS SQL Server — database exposed' },
  1521: { level: 'high', note: 'Oracle DB — database exposed' },
  2049: { level: 'medium', note: 'NFS — file share exposure' },
  2375: { level: 'high', note: 'Docker API (unencrypted) — full host takeover risk' },
  3306: { level: 'high', note: 'MySQL — database exposed' },
  3389: { level: 'high', note: 'RDP — brute-force / BlueKeep target' },
  5432: { level: 'high', note: 'PostgreSQL — database exposed' },
  5900: { level: 'high', note: 'VNC — remote desktop, often weak auth' },
  5984: { level: 'medium', note: 'CouchDB — often unauthenticated' },
  6379: { level: 'high', note: 'Redis — frequently unauthenticated' },
  9200: { level: 'high', note: 'Elasticsearch — often unauthenticated' },
  11211: { level: 'medium', note: 'Memcached — amplification / data exposure' },
  27017: { level: 'high', note: 'MongoDB — often unauthenticated' }
}

function riskFor(p: PortInfo): Risk | null {
  if (!p.state.startsWith('open')) return null
  return RISKY_PORTS[p.port] ?? null
}

const RISK_COLOR: Record<RiskLevel, string> = {
  high: '#f87171',
  medium: '#fbbf24',
  info: '#60a5fa'
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function stateColor(state: PortState): { text: string; bg: string } {
  switch (state) {
    case 'open': return { text: '#34d399', bg: '#34d39920' }
    case 'closed': return { text: '#f87171', bg: '#f8717120' }
    case 'filtered': return { text: '#fbbf24', bg: '#fbbf2420' }
    case 'open|filtered': return { text: '#a3e635', bg: '#a3e63520' }
    default: return { text: '#8b8b98', bg: '#8b8b9820' }
  }
}

function banner(p: PortInfo): string {
  return [p.product, p.version, p.extraInfo && `(${p.extraInfo})`].filter(Boolean).join(' ')
}

const WEB_PORTS = new Set([80, 81, 443, 591, 2082, 2083, 3000, 5000, 8000, 8008, 8080, 8081, 8443, 8888, 9000])
function browserUrl(host: string, p: PortInfo): string | null {
  const isWeb = WEB_PORTS.has(p.port) || /https?|http-alt|http-proxy|ssl/.test(p.service ?? '')
  if (!isWeb) return null
  const https = p.port === 443 || p.port === 8443 || /https|ssl/.test(p.service ?? '')
  const scheme = https ? 'https' : 'http'
  const portPart = (https && p.port === 443) || (!https && p.port === 80) ? '' : `:${p.port}`
  return `${scheme}://${host}${portPart}`
}

function nmapCommand(c: PortScanConfig): string {
  const a = ['nmap', '-v', '-T4', c.protocol === 'udp' ? '-sU' : '-sT']
  if (c.serviceDetection) a.push('-sV')
  if (c.preset === 'top100') a.push('--top-ports 100')
  else if (c.preset === 'top1000') a.push('--top-ports 1000')
  else if (c.preset === 'all') a.push('-p-')
  else a.push(`-p ${c.customPorts}`)
  a.push(c.target)
  return a.join(' ')
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
}

// ── Per-port action menu ─────────────────────────────────────────────────────

const menuItemCls =
  'flex items-center gap-2 px-3 py-1.5 text-xs text-fg-default rounded cursor-pointer outline-none data-[highlighted]:bg-canvas-hover'

function PortActions({ port, host, traceTarget }: { port: PortInfo; host: string; traceTarget: string }): React.JSX.Element {
  const openWhois = useUIStore((s) => s.openWhois)
  const traceHost = useUIStore((s) => s.traceHost)
  const url = browserUrl(host, port)

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
          {url && (
            <DropdownMenu.Item className={menuItemCls}
              onSelect={() => window.nmtrAPI.openExternal({ url })}>
              <Globe className="w-3.5 h-3.5 text-accent-blue" /> Open in browser
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={menuItemCls}
            onSelect={() => navigator.clipboard.writeText(`${host}:${port.port}`)}>
            <Copy className="w-3.5 h-3.5 text-fg-muted" /> Copy {host}:{port.port}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemCls} onSelect={() => openWhois(host)}>
            <Search className="w-3.5 h-3.5 text-fg-muted" /> WHOIS lookup
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemCls} onSelect={() => traceHost(traceTarget)}>
            <Crosshair className="w-3.5 h-3.5 text-fg-muted" /> Traceroute host
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export function PortScanView(): React.JSX.Element {
  const prefill = useUIStore((s) => s.portScanPrefill)
  const clearPrefill = useUIStore((s) => s.clearPortScanPrefill)

  const [target, setTarget] = useState('')
  const [preset, setPreset] = useState<PortScanPreset>('top1000')
  const [customPorts, setCustomPorts] = useState('1-1000')
  const [protocol, setProtocol] = useState<PortScanProtocol>('tcp')
  const [serviceDetection, setServiceDetection] = useState(true)

  const [nmap, setNmap] = useState<NmapCheckResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [percent, setPercent] = useState<number | null>(null)
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [livePorts, setLivePorts] = useState<number[]>([])
  const [result, setResult] = useState<PortScanResult | null>(null)
  const [scannedConfig, setScannedConfig] = useState<PortScanConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const scanIdRef = useRef<string | null>(null)

  // Detect nmap once on mount.
  useEffect(() => {
    window.nmtrAPI.portScanCheck().then(setNmap).catch(() => setNmap({ available: false, version: null, path: null }))
  }, [])

  // Consume a prefilled target from the LAN view.
  useEffect(() => {
    if (prefill) {
      setTarget(prefill)
      clearPrefill()
    }
  }, [prefill, clearPrefill])

  // Subscribe to streaming progress / completion.
  useEffect(() => {
    const offProgress = window.nmtrAPI.onPortScanProgress((e: PortScanProgressEvent) => {
      if (e.scanId !== scanIdRef.current) return
      if (e.percent !== null) setPercent(e.percent)
      if (e.message) setStatusMsg(e.message)
      if (e.openPort) {
        setLivePorts((prev) => prev.includes(e.openPort!.port) ? prev : [...prev, e.openPort!.port].sort((a, b) => a - b))
      }
    })
    const offDone = window.nmtrAPI.onPortScanDone((e: PortScanDoneEvent) => {
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
      }
    })
    return () => { offProgress(); offDone() }
  }, [])

  const startScan = useCallback(async () => {
    const t = target.trim()
    if (!t || scanning) return
    setScanning(true)
    setError(null)
    setResult(null)
    setLivePorts([])
    setPercent(0)
    setStatusMsg('Starting nmap…')

    const config: PortScanConfig = { target: t, protocol, preset, customPorts, serviceDetection }
    setScannedConfig(config)
    try {
      const { scanId } = await window.nmtrAPI.portScanStart({ config })
      scanIdRef.current = scanId
    } catch (err) {
      setScanning(false)
      setPercent(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [target, protocol, preset, customPorts, serviceDetection, scanning])

  const cancelScan = useCallback(() => {
    if (scanIdRef.current) window.nmtrAPI.portScanCancel({ scanId: scanIdRef.current })
  }, [])

  const copyCommand = useCallback(() => {
    if (!scannedConfig) return
    navigator.clipboard.writeText(nmapCommand(scannedConfig))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [scannedConfig])

  // ── nmap missing ──
  if (nmap && !nmap.available) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-canvas-default gap-5 p-6">
        <ShieldAlert className="w-16 h-16 text-accent-red opacity-70" />
        <div className="text-center max-w-md">
          <p className="text-fg-default text-lg font-semibold mb-2">nmap not found</p>
          <p className="text-fg-muted text-sm mb-1">
            The port scanner uses the <span className="font-mono text-fg-default">nmap</span> command-line tool, which isn't installed or couldn't be located.
          </p>
          <p className="text-fg-subtle text-xs">Install it, then reopen this view.</p>
        </div>
        <a href="https://nmap.org/download" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-accent-blue text-canvas-default hover:opacity-90 transition-opacity">
          <ExternalLink className="w-4 h-4" /> Download nmap
        </a>
        <button onClick={() => window.nmtrAPI.portScanCheck().then(setNmap)}
          className="text-xs text-fg-muted hover:text-fg-default underline">
          Re-check
        </button>
      </div>
    )
  }

  const host = result ? (result.resolvedIp ?? result.target) : ''
  const diff = result?.diff ?? null
  const unchanged = diff && diff.previousScanAt !== null && diff.newlyOpened.length === 0 && diff.newlyClosed.length === 0

  return (
    <div className="flex-1 flex flex-col bg-canvas-default overflow-hidden">
      {/* ── Controls bar ── */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') startScan() }}
          placeholder="Host, IP, or CIDR (e.g. 192.168.1.1)"
          spellCheck={false}
          disabled={scanning}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm font-mono rounded-md bg-canvas-default border border-border-default text-fg-default placeholder:text-fg-subtle focus:outline-none focus:border-accent-blue disabled:opacity-60"
        />

        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as PortScanPreset)}
          disabled={scanning}
          className="px-2.5 py-1.5 text-sm rounded-md bg-canvas-default border border-border-default text-fg-default focus:outline-none focus:border-accent-blue disabled:opacity-60"
        >
          {(Object.keys(PRESET_LABELS) as PortScanPreset[]).map((p) => (
            <option key={p} value={p}>{PRESET_LABELS[p]}</option>
          ))}
        </select>

        {preset === 'custom' && (
          <input
            value={customPorts}
            onChange={(e) => setCustomPorts(e.target.value)}
            placeholder="22,80,443,8000-8100"
            spellCheck={false}
            disabled={scanning}
            className="w-44 px-3 py-1.5 text-sm font-mono rounded-md bg-canvas-default border border-border-default text-fg-default placeholder:text-fg-subtle focus:outline-none focus:border-accent-blue disabled:opacity-60"
          />
        )}

        {/* Protocol toggle */}
        <div className="flex rounded-md border border-border-default overflow-hidden">
          {(['tcp', 'udp'] as PortScanProtocol[]).map((p) => (
            <button key={p} onClick={() => setProtocol(p)} disabled={scanning}
              className={`px-3 py-1.5 text-xs font-semibold uppercase transition-colors disabled:opacity-60 ${
                protocol === p ? 'bg-accent-blue/15 text-accent-blue' : 'text-fg-muted hover:text-fg-default'
              }`}>
              {p}
            </button>
          ))}
        </div>

        {/* Service detection */}
        <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer select-none">
          <input type="checkbox" checked={serviceDetection} disabled={scanning}
            onChange={(e) => setServiceDetection(e.target.checked)}
            className="accent-accent-blue" />
          Service + banner
        </label>

        {!scanning ? (
          <button onClick={startScan} disabled={!target.trim()}
            className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md bg-accent-blue text-canvas-default hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
            {result ? <RefreshCw className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            {result ? 'Rescan' : 'Scan'}
          </button>
        ) : (
          <button onClick={cancelScan}
            className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md border border-border-default text-fg-default hover:bg-canvas-hover transition-colors">
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
            <span className="text-xs font-mono text-accent-green">
              {livePorts.length} open port{livePorts.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-canvas-inset overflow-hidden">
            <div className="h-full bg-accent-blue transition-all duration-300"
              style={{ width: `${percent ?? 5}%` }} />
          </div>
          {livePorts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {livePorts.map((p) => (
                <span key={p} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
                  style={{ color: '#34d399', background: '#34d39920' }}>{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mx-5 mt-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg flex items-start gap-3 text-accent-red">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-mono opacity-90">{error}</p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!scanning && !result && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <Server className="w-16 h-16 text-fg-subtle opacity-40" />
          <div>
            <p className="text-fg-subtle text-base font-medium mb-1">Port Scanner</p>
            <p className="text-fg-muted text-sm">Enter a target and scan for open ports with nmap</p>
          </div>
          {nmap?.version && (
            <p className="text-fg-subtle text-xs font-mono">nmap {nmap.version}</p>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-default bg-canvas-inset flex-shrink-0 flex-wrap text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg-default">
              {result.hostUp
                ? <CheckCircle2 className="w-3.5 h-3.5 text-accent-green" />
                : <AlertCircle className="w-3.5 h-3.5 text-accent-red" />}
              {result.target}
              {result.resolvedIp && result.resolvedIp !== result.target && (
                <span className="text-fg-subtle font-mono font-normal">({result.resolvedIp})</span>
              )}
            </span>
            <span className={result.hostUp ? 'text-accent-green' : 'text-accent-red'}>
              {result.hostUp ? 'host up' : 'host down / no response'}
            </span>
            <div className="flex items-center gap-3 text-fg-subtle font-mono">
              <span className="text-accent-green">{result.ports.filter((p) => p.state.startsWith('open')).length} open</span>
              {result.closedCount > 0 && <span>{result.closedCount} closed</span>}
              {result.filteredCount > 0 && <span>{result.filteredCount} filtered</span>}
              <span className="opacity-40">|</span>
              <span>{(result.durationMs / 1000).toFixed(1)}s</span>
            </div>

            {/* Export + copy command */}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={copyCommand}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors">
                <Terminal className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy nmap cmd'}
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
                    {(['csv', 'html', 'json'] as PortScanExportFormat[]).map((fmt) => (
                      <DropdownMenu.Item key={fmt} className={menuItemCls}
                        onSelect={() => window.nmtrAPI.portScanExport({ result, format: fmt })}>
                        <Download className="w-3.5 h-3.5 text-fg-muted" /> {fmt.toUpperCase()}
                      </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className="my-1 h-px bg-border-default" />
                    <DropdownMenu.Item className={menuItemCls}
                      onSelect={() => window.nmtrAPI.portScanExport({ result, format: 'text' })}>
                      <Copy className="w-3.5 h-3.5 text-fg-muted" /> Copy as Text
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          {/* Diff strip vs previous scan */}
          {diff && diff.previousScanAt !== null && (
            <div className="px-5 py-2 border-b border-border-default bg-canvas-subtle flex-shrink-0 flex items-center gap-3 flex-wrap text-[11px]">
              <span className="text-fg-subtle">vs previous scan {formatWhen(diff.previousScanAt)}:</span>
              {unchanged && <span className="text-fg-muted">no change</span>}
              {diff.newlyOpened.length > 0 && (
                <span className="inline-flex items-center gap-1 text-accent-green font-medium">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {diff.newlyOpened.length} newly opened: {diff.newlyOpened.join(', ')}
                </span>
              )}
              {diff.newlyClosed.length > 0 && (
                <span className="inline-flex items-center gap-1 text-accent-red font-medium">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  {diff.newlyClosed.length} closed since: {diff.newlyClosed.map((p) => p.port).join(', ')}
                </span>
              )}
            </div>
          )}

          {/* Port table */}
          <div className="flex-1 overflow-y-auto">
            {result.ports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-fg-muted">
                <p className="text-sm">No open ports found</p>
                <p className="text-xs text-fg-subtle">
                  {result.closedCount + result.filteredCount} port{result.closedCount + result.filteredCount !== 1 ? 's' : ''} scanned, none open
                </p>
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-canvas-inset z-10">
                  <tr className="text-fg-subtle text-left border-b border-border-muted">
                    <th className="px-5 py-2 font-semibold w-28">Port</th>
                    <th className="px-4 py-2 font-semibold w-24">State</th>
                    <th className="px-4 py-2 font-semibold w-44">Service</th>
                    <th className="px-4 py-2 font-semibold">Version / Banner</th>
                    <th className="px-4 py-2 font-semibold w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {result.ports.map((p) => {
                    const sc = stateColor(p.state)
                    const risk = riskFor(p)
                    const isNew = diff?.newlyOpened.includes(p.port) ?? false
                    return (
                      <tr key={`${p.protocol}-${p.port}`} className="border-b border-border-muted/50 hover:bg-canvas-hover/50 group">
                        <td className="px-5 py-2 font-mono text-fg-default">
                          {p.port}<span className="text-fg-subtle">/{p.protocol}</span>
                          {isNew && (
                            <span className="ml-2 px-1 py-0.5 rounded text-[9px] font-semibold align-middle"
                              style={{ color: '#34d399', background: '#34d39920' }}>NEW</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{ color: sc.text, background: sc.bg }}>{p.state}</span>
                        </td>
                        <td className="px-4 py-2 text-fg-default">
                          <span className="inline-flex items-center gap-1.5">
                            {p.service ?? '—'}
                            {risk && (
                              <span title={risk.note}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold cursor-help"
                                style={{ color: RISK_COLOR[risk.level], background: RISK_COLOR[risk.level] + '20' }}>
                                <ShieldAlert className="w-2.5 h-2.5" />
                                {risk.level === 'high' ? 'RISK' : risk.level === 'medium' ? 'WARN' : 'INFO'}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-fg-muted font-mono">{banner(p) || '—'}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <PortActions port={p} host={host} traceTarget={result.target} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
