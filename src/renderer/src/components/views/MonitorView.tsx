import React, { useEffect, useMemo, useState } from 'react'
import { useMonitorStore } from '../../store/useMonitorStore'
import type {
  MonitorView as MonitorViewModel,
  MonitorConfig,
  MonitorType,
  MonitorStatus,
  MonitorResult,
  MonitorIncident
} from '@shared/types'

// ── Presentation helpers ──────────────────────────────────────────────────────

function statusColor(s: MonitorStatus): string {
  switch (s) {
    case 'up': return '#34d399'
    case 'degraded': return '#f59e0b'
    case 'down': return '#f87171'
    default: return '#6b6b78'
  }
}

function statusLabel(s: MonitorStatus): string {
  switch (s) {
    case 'up': return 'Up'
    case 'degraded': return 'Degraded'
    case 'down': return 'Down'
    default: return 'Unknown'
  }
}

const TYPE_LABEL: Record<MonitorType, string> = {
  http: 'HTTP', tcp: 'TCP', ping: 'Ping', dns: 'DNS', cert: 'TLS cert'
}

function typeTargetSummary(c: MonitorConfig): string {
  switch (c.type) {
    case 'tcp': return `${c.target}:${c.port ?? '?'}`
    case 'cert': return `${c.target}:${c.port ?? 443}`
    case 'dns': return `${c.target} (${c.dnsRecordType ?? 'A'})`
    default: return c.target
  }
}

function relTime(ts: number | null): string {
  if (ts === null) return 'never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Status-colored sparkline (one bar per recent check) ───────────────────────

function StatusSparkline({ recent }: { recent: MonitorResult[] }): React.JSX.Element {
  const width = 160
  const height = 28
  const slots = 60
  const data = recent.slice(-slots)
  const latencies = data.map((r) => r.latencyMs).filter((v): v is number => v !== null)
  const max = Math.max(...latencies, 1)
  const barW = width / slots
  return (
    <svg width={width} height={height} className="overflow-visible">
      {data.map((r, i) => {
        const color = statusColor(r.status)
        // Down checks render as a short full-height tick so outages stay visible.
        const h = r.status === 'down' ? height : Math.max(3, ((r.latencyMs ?? 0) / max) * height)
        const idx = slots - data.length + i
        return (
          <rect key={i} x={idx * barW + 0.5} y={height - h}
            width={Math.max(1, barW - 1)} height={h} rx={1}
            fill={color} opacity={r.status === 'down' ? 0.5 : 0.85} />
        )
      })}
    </svg>
  )
}

// ── Add / edit form ───────────────────────────────────────────────────────────

interface FormState {
  label: string
  type: MonitorType
  target: string
  port: string
  intervalSec: string
  latencyWarnMs: string
  expiryWarnDays: string
  expectStatusMin: string
  expectStatusMax: string
  dnsRecordType: string
  enabled: boolean
}

const BLANK_FORM: FormState = {
  label: '', type: 'http', target: '', port: '', intervalSec: '60',
  latencyWarnMs: '', expiryWarnDays: '14', expectStatusMin: '200', expectStatusMax: '399',
  dnsRecordType: 'A', enabled: true
}

// Hoisted to module scope so its identity is stable across MonitorForm
// re-renders — defining it inline would remount every input on each keystroke
// and the fields would lose focus after a single character.
const FORM_INPUT_CLS =
  'px-2 py-1 rounded bg-canvas-default border border-border-default text-fg-default text-xs focus:outline-none focus:border-accent-blue'

function FormField({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-fg-subtle font-semibold">{label}</span>
      {children}
    </label>
  )
}

function configToForm(c: MonitorConfig): FormState {
  return {
    label: c.label, type: c.type, target: c.target,
    port: c.port?.toString() ?? '',
    intervalSec: c.intervalSec.toString(),
    latencyWarnMs: c.latencyWarnMs?.toString() ?? '',
    expiryWarnDays: c.expiryWarnDays?.toString() ?? '14',
    expectStatusMin: c.expectStatusMin?.toString() ?? '200',
    expectStatusMax: c.expectStatusMax?.toString() ?? '399',
    dnsRecordType: c.dnsRecordType ?? 'A',
    enabled: c.enabled
  }
}

function MonitorForm({ initial, onSubmit, onCancel }: {
  initial: MonitorConfig | null
  onSubmit: (cfg: Omit<MonitorConfig, 'id' | 'createdAt'>) => void
  onCancel: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<FormState>(initial ? configToForm(initial) : BLANK_FORM)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void => setForm((f) => ({ ...f, [k]: v }))

  const needsPort = form.type === 'tcp' || form.type === 'cert'
  const targetPlaceholder = form.type === 'http' ? 'https://example.com' : 'example.com'
  const intNum = (s: string): number | null => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null }

  const submit = (): void => {
    const target = form.target.trim()
    if (!target) return
    onSubmit({
      label: form.label.trim() || target,
      type: form.type,
      target,
      port: needsPort ? (intNum(form.port) ?? (form.type === 'cert' ? 443 : null)) : null,
      intervalSec: Math.max(10, intNum(form.intervalSec) ?? 60),
      enabled: form.enabled,
      expectStatusMin: form.type === 'http' ? intNum(form.expectStatusMin) : null,
      expectStatusMax: form.type === 'http' ? intNum(form.expectStatusMax) : null,
      latencyWarnMs: (form.type === 'http' || form.type === 'tcp' || form.type === 'ping') ? intNum(form.latencyWarnMs) : null,
      expiryWarnDays: form.type === 'cert' ? intNum(form.expiryWarnDays) : null,
      dnsRecordType: form.type === 'dns' ? (form.dnsRecordType.trim().toUpperCase() || 'A') : null
    })
  }

  const inputCls = FORM_INPUT_CLS

  return (
    <div className="rounded-lg border border-accent-blue/30 bg-canvas-subtle p-4 mb-4">
      <div className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-3">
        {initial ? 'Edit monitor' : 'New monitor'}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FormField label="Label">
          <input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)}
            placeholder="My site" />
        </FormField>
        <FormField label="Type">
          <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value as MonitorType)}>
            {(['http', 'tcp', 'ping', 'dns', 'cert'] as MonitorType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </FormField>
        <FormField label={form.type === 'http' ? 'URL' : form.type === 'dns' ? 'Domain' : 'Host'}>
          <input className={inputCls} value={form.target} onChange={(e) => set('target', e.target.value)}
            placeholder={targetPlaceholder} />
        </FormField>
        {needsPort && (
          <FormField label="Port">
            <input className={inputCls} value={form.port} onChange={(e) => set('port', e.target.value)}
              placeholder={form.type === 'cert' ? '443' : '443'} />
          </FormField>
        )}
        <FormField label="Interval (s)">
          <input className={inputCls} value={form.intervalSec} onChange={(e) => set('intervalSec', e.target.value)} />
        </FormField>
        {(form.type === 'http' || form.type === 'tcp' || form.type === 'ping') && (
          <FormField label="Slow if > (ms)">
            <input className={inputCls} value={form.latencyWarnMs} onChange={(e) => set('latencyWarnMs', e.target.value)}
              placeholder="optional" />
          </FormField>
        )}
        {form.type === 'http' && (
          <>
            <FormField label="Status min">
              <input className={inputCls} value={form.expectStatusMin} onChange={(e) => set('expectStatusMin', e.target.value)} />
            </FormField>
            <FormField label="Status max">
              <input className={inputCls} value={form.expectStatusMax} onChange={(e) => set('expectStatusMax', e.target.value)} />
            </FormField>
          </>
        )}
        {form.type === 'cert' && (
          <FormField label="Warn if < (days)">
            <input className={inputCls} value={form.expiryWarnDays} onChange={(e) => set('expiryWarnDays', e.target.value)} />
          </FormField>
        )}
        {form.type === 'dns' && (
          <FormField label="Record type">
            <input className={inputCls} value={form.dnsRecordType} onChange={(e) => set('dnsRecordType', e.target.value)} />
          </FormField>
        )}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button onClick={submit}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-accent-blue text-canvas-default hover:opacity-90">
          {initial ? 'Save' : 'Add monitor'}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded border border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-hover">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Monitor card ───────────────────────────────────────────────────────────────

function MonitorCard({ m, onRunNow, onEdit, onToggle, onRemove }: {
  m: MonitorViewModel
  onRunNow: () => void
  onEdit: () => void
  onToggle: () => void
  onRemove: () => void
}): React.JSX.Element {
  const { config, stats } = m
  const color = statusColor(stats.status)
  return (
    <div className="rounded-lg border border-border-default bg-canvas-subtle p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
            <span className="text-sm font-semibold text-fg-default truncate">{config.label}</span>
            {!config.enabled && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-fg-subtle bg-canvas-inset">paused</span>
            )}
          </div>
          <div className="text-[11px] text-fg-muted font-mono truncate mt-0.5">
            <span className="text-fg-subtle">{TYPE_LABEL[config.type]}</span> · {typeTargetSummary(config)}
          </div>
        </div>
        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color }}>{statusLabel(stats.status)}</span>
      </div>

      <StatusSparkline recent={stats.recent} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-semibold text-fg-default font-mono">
            {stats.uptime24hPct !== null ? `${stats.uptime24hPct}%` : '—'}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-fg-subtle">uptime 24h</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-fg-default font-mono">
            {stats.lastLatencyMs !== null ? `${stats.lastLatencyMs}ms` : '—'}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-fg-subtle">latency</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-fg-default font-mono">{stats.checks24h}</div>
          <div className="text-[9px] uppercase tracking-wide text-fg-subtle">checks 24h</div>
        </div>
      </div>

      <div className="text-[11px] text-fg-muted truncate" title={stats.lastMessage ?? ''}>
        {stats.lastMessage ?? 'No checks yet'}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border-muted">
        <span className="text-[10px] text-fg-subtle">checked {relTime(stats.lastCheckedAt)}</span>
        <div className="flex items-center gap-1">
          <CardBtn onClick={onRunNow} title="Run now">Run</CardBtn>
          <CardBtn onClick={onToggle} title={config.enabled ? 'Pause' : 'Resume'}>{config.enabled ? 'Pause' : 'Resume'}</CardBtn>
          <CardBtn onClick={onEdit} title="Edit">Edit</CardBtn>
          <CardBtn onClick={onRemove} title="Delete" danger>Delete</CardBtn>
        </div>
      </div>
    </div>
  )
}

function CardBtn({ children, onClick, title, danger }: {
  children: React.ReactNode; onClick: () => void; title: string; danger?: boolean
}): React.JSX.Element {
  return (
    <button onClick={onClick} title={title}
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border border-border-default transition-colors ${
        danger ? 'text-fg-muted hover:text-red-400 hover:border-red-400/50' : 'text-fg-muted hover:text-fg-default hover:bg-canvas-hover'
      }`}>
      {children}
    </button>
  )
}

// ── Incident timeline ─────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`
}

function IncidentList({ incidents, monitors }: { incidents: MonitorIncident[]; monitors: MonitorViewModel[] }): React.JSX.Element {
  const labelFor = (id: string): string => monitors.find((m) => m.config.id === id)?.config.label ?? 'Removed monitor'
  if (incidents.length === 0) {
    return <div className="text-xs text-fg-subtle px-1 py-4 text-center">No incidents recorded.</div>
  }
  return (
    <div className="flex flex-col">
      {incidents.slice(0, 50).map((inc) => {
        const ongoing = inc.resolvedAt === null
        const dur = fmtDuration((inc.resolvedAt ?? Date.now()) - inc.startedAt)
        return (
          <div key={inc.id} className="flex items-center gap-3 py-1.5 border-b border-border-muted/50 text-[11px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor(inc.status) }} />
            <span className="text-fg-default font-medium w-40 truncate">{labelFor(inc.monitorId)}</span>
            <span className="text-fg-muted flex-1 truncate">{inc.reason ?? statusLabel(inc.status)}</span>
            <span className={`font-mono ${ongoing ? 'text-red-400' : 'text-fg-subtle'}`}>{ongoing ? `ongoing · ${dur}` : dur}</span>
            <span className="text-fg-subtle w-20 text-right">{relTime(inc.startedAt)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function MonitorView(): React.JSX.Element {
  const { monitors, incidents, loaded, load, add, update, remove, runNow } = useMonitorStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MonitorConfig | null>(null)

  useEffect(() => { if (!loaded) void load() }, [loaded, load])

  // Re-render once a second so relative times stay fresh.
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const upCount = useMemo(() => monitors.filter((m) => m.stats.status === 'up').length, [monitors])
  const downCount = useMemo(() => monitors.filter((m) => m.stats.status === 'down').length, [monitors])

  const openNew = (): void => { setEditing(null); setShowForm(true) }
  const openEdit = (c: MonitorConfig): void => { setEditing(c); setShowForm(true) }

  const handleSubmit = async (cfg: Omit<MonitorConfig, 'id' | 'createdAt'>): Promise<void> => {
    if (editing) await update({ id: editing.id, patch: cfg })
    else await add({ config: cfg })
    setShowForm(false)
    setEditing(null)
  }

  return (
    <div className="flex-1 flex flex-col bg-canvas-default overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border-default bg-canvas-inset flex-shrink-0">
        <span className="text-xs font-semibold text-fg-muted tracking-wide uppercase">Monitors</span>
        {monitors.length > 0 && (
          <span className="text-[11px] font-mono">
            <span style={{ color: statusColor('up') }}>{upCount} up</span>
            {downCount > 0 && <span style={{ color: statusColor('down') }}> · {downCount} down</span>}
            <span className="text-fg-subtle"> · {monitors.length} total</span>
          </span>
        )}
        <div className="ml-auto">
          <button onClick={openNew}
            className="px-3 py-1 text-[11px] font-semibold rounded bg-accent-blue text-canvas-default hover:opacity-90">
            + Add monitor
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {showForm && (
          <MonitorForm initial={editing} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null) }} />
        )}

        {monitors.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.4" opacity={0.55}>
              <path d="M3 12h4l2 6 4-14 2 8h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-fg-subtle text-base font-medium mb-1">No monitors yet</p>
              <p className="text-fg-muted text-sm max-w-sm">Watch a website, port, host, DNS record, or TLS certificate on a schedule. You'll get a desktop alert when something goes down.</p>
            </div>
            <button onClick={openNew}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-accent-blue text-canvas-default hover:opacity-90">
              Create your first monitor
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {monitors.map((m) => (
                <MonitorCard key={m.config.id} m={m}
                  onRunNow={() => void runNow(m.config.id)}
                  onEdit={() => openEdit(m.config)}
                  onToggle={() => void update({ id: m.config.id, patch: { enabled: !m.config.enabled } })}
                  onRemove={() => { if (confirm(`Delete monitor "${m.config.label}"?`)) void remove(m.config.id) }}
                />
              ))}
            </div>

            {monitors.length > 0 && (
              <div className="mt-6 rounded-lg border border-border-default bg-canvas-subtle overflow-hidden">
                <div className="px-4 py-2 border-b border-border-default">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Incident timeline</span>
                </div>
                <div className="px-4 py-2">
                  <IncidentList incidents={incidents} monitors={monitors} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
