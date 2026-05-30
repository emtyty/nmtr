import React, { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, Trash2, RotateCcw, Server } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { AppSettings, Theme, Protocol, DnsResolverPreset } from '@shared/types'
import { DEFAULT_DNS_RESOLVERS } from '@shared/types'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps): React.JSX.Element {
  const { settings, update } = useSettingsStore()
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [tab, setTab] = useState<'general' | 'trace' | 'dns' | 'turn'>('general')

  useEffect(() => {
    if (open) {
      setDraft(settings)
      setTab('general')
    }
  }, [open])

  async function handleSave(): Promise<void> {
    // Drop incomplete resolver rows (blank name or IP) before persisting.
    const cleaned: AppSettings = {
      ...draft,
      dnsResolvers: draft.dnsResolvers
        .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
        .filter((r) => r.label && r.value)
    }
    await update(cleaned)
    onClose()
  }

  function setProp<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  // ── DNS resolver list helpers ──
  function setResolvers(resolvers: DnsResolverPreset[]): void {
    setProp('dnsResolvers', resolvers)
  }
  function updateResolver(index: number, patch: Partial<DnsResolverPreset>): void {
    setResolvers(draft.dnsResolvers.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  function removeResolver(index: number): void {
    setResolvers(draft.dnsResolvers.filter((_, i) => i !== index))
  }
  function addResolver(): void {
    setResolvers([...draft.dnsResolvers, { label: '', value: '' }])
  }
  function resetResolvers(): void {
    setResolvers(DEFAULT_DNS_RESOLVERS)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas-subtle border border-border-default rounded-lg w-[620px] flex flex-col z-50 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <Dialog.Title className="text-base font-semibold text-fg-default">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-fg-muted hover:text-fg-default text-lg leading-none">×</button>
            </Dialog.Close>
          </div>

          {/* Body: left tab rail + fixed-height content. The fixed height keeps the
              dialog the same size across tabs, so switching never resizes it. */}
          <div className="flex h-[520px] min-h-0">
            {/* Left tab rail */}
            <div className="w-36 shrink-0 border-r border-border-default p-2 flex flex-col gap-1">
              {([['general', 'General'], ['trace', 'Trace'], ['dns', 'DNS List'], ['turn', 'TURN']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`text-left px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    tab === id
                      ? 'bg-accent-blue/10 text-accent-blue'
                      : 'text-fg-muted hover:text-fg-default hover:bg-canvas-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content (scrolls within the fixed-height body) */}
            <div className="flex-1 min-w-0 overflow-auto">
          <div className={`p-4 space-y-4 ${tab === 'general' ? '' : 'hidden'}`}>
            {/* Theme */}
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Theme
              </label>
              <select
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue"
                value={draft.theme}
                onChange={(e) => setProp('theme', e.target.value as Theme)}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>

            {/* General app behaviour */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.minimizeToTray}
                  onChange={(e) => setProp('minimizeToTray', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Minimize to Tray on Close</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.launchAtLogin}
                  onChange={(e) => setProp('launchAtLogin', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Launch at Login</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.checkUpdatesOnStartup}
                  onChange={(e) => setProp('checkUpdatesOnStartup', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Check for Updates on Startup</span>
              </label>
            </div>
            <p className="text-xs text-fg-subtle leading-relaxed">
              “Launch at Login” registers the installed app to start with Windows; it has no effect in development builds.
            </p>
          </div>

          {/* Trace tab */}
          <div className={`p-4 space-y-4 ${tab === 'trace' ? '' : 'hidden'}`}>
            {/* Default Interval */}
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Default Probe Interval
              </label>
              <select
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue"
                value={draft.defaultIntervalMs}
                onChange={(e) => setProp('defaultIntervalMs', Number(e.target.value))}
              >
                <option value={500}>500ms</option>
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={5000}>5s</option>
              </select>
            </div>

            {/* Max Hops */}
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Max Hops
              </label>
              <input
                type="number"
                min={1}
                max={30}
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue"
                value={draft.maxHops}
                onChange={(e) => setProp('maxHops', Math.min(30, Math.max(1, Number(e.target.value))))}
              />
            </div>

            {/* Packet Size */}
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Packet Size (bytes)
              </label>
              <input
                type="number"
                min={28}
                max={1472}
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue"
                value={draft.defaultPacketSize}
                onChange={(e) => setProp('defaultPacketSize', Number(e.target.value))}
              />
            </div>

            {/* Checkboxes */}
            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.defaultUseIPv6}
                  onChange={(e) => setProp('defaultUseIPv6', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Default to IPv6 for new traces</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.resolveHostnames}
                  onChange={(e) => setProp('resolveHostnames', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Resolve Hostnames</span>
              </label>
            </div>

            {/* Runtime alerts */}
            <div className="pt-2 border-t border-border-default space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.alertsEnabled}
                  onChange={(e) => setProp('alertsEnabled', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Enable SLO alerts</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                    Loss Threshold (%)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    disabled={!draft.alertsEnabled}
                    className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue disabled:opacity-60"
                    value={draft.alertLossPct}
                    onChange={(e) => setProp('alertLossPct', Math.min(100, Math.max(1, Number(e.target.value))))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                    RTT Threshold (ms)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={10_000}
                    disabled={!draft.alertsEnabled}
                    className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue disabled:opacity-60"
                    value={draft.alertRttMs}
                    onChange={(e) => setProp('alertRttMs', Math.min(10000, Math.max(10, Number(e.target.value))))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                  Alert Cooldown (sec)
                </label>
                <input
                  type="number"
                  min={5}
                  max={600}
                  disabled={!draft.alertsEnabled}
                  className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue disabled:opacity-60"
                  value={draft.alertCooldownSec}
                  onChange={(e) => setProp('alertCooldownSec', Math.min(600, Math.max(5, Number(e.target.value))))}
                />
              </div>
            </div>
          </div>

          {/* DNS List tab */}
          <div className={`p-4 space-y-3 ${tab === 'dns' ? '' : 'hidden'}`}>
            <p className="text-xs text-fg-muted leading-relaxed">
              DNS resolvers offered in the <span className="text-fg-default font-medium">DNS Resolver</span> view dropdown.
              <span className="text-fg-default font-medium"> System default</span> is always available; add your own
              servers below by IP address.
            </p>

            <div className="space-y-2">
              {draft.dnsResolvers.length === 0 && (
                <p className="text-xs text-fg-subtle italic py-2">No custom resolvers — only System default will be offered.</p>
              )}
              {draft.dnsResolvers.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Name (e.g. Cloudflare)"
                    className="flex-1 min-w-0 bg-canvas-default border border-border-default rounded px-2.5 py-1.5 text-sm text-fg-default outline-none focus:border-accent-blue"
                    value={r.label}
                    onChange={(e) => updateResolver(i, { label: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="IP (e.g. 1.1.1.1)"
                    className="w-36 shrink-0 bg-canvas-default border border-border-default rounded px-2.5 py-1.5 text-sm text-fg-default outline-none focus:border-accent-blue font-mono"
                    value={r.value}
                    onChange={(e) => updateResolver(i, { value: e.target.value.trim() })}
                  />
                  <button
                    onClick={() => removeResolver(i)}
                    title="Remove resolver"
                    className="shrink-0 p-1.5 rounded text-fg-subtle hover:text-accent-red hover:bg-canvas-hover transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={addResolver}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border-default text-sm text-fg-muted hover:border-accent-blue hover:text-fg-default transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add resolver
              </button>
              <button
                onClick={resetResolvers}
                title="Restore the default public resolvers"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border-default text-sm text-fg-muted hover:border-fg-muted hover:text-fg-default transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
              </button>
            </div>

            <p className="inline-flex items-center gap-1.5 text-xs text-fg-subtle pt-1">
              <Server className="w-3.5 h-3.5" /> Entries with a blank name or IP are ignored.
            </p>
          </div>

          {/* TURN tab */}
          <div className={`p-4 space-y-4 ${tab === 'turn' ? '' : 'hidden'}`}>
            <p className="text-xs text-fg-muted leading-relaxed">
              TURN relay used by the Speed Test for the <span className="text-fg-default font-medium">packet-loss</span> measurement.
              Leave blank to disable packet loss (download, upload, ping and jitter still work).
              Get free credentials from Metered.ca, Cloudflare Realtime, or a self-hosted coturn.
            </p>

            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Server URI
              </label>
              <input
                type="text"
                placeholder="standard.relay.metered.ca:80"
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue font-mono"
                value={draft.turnServerUri}
                onChange={(e) => setProp('turnServerUri', e.target.value)}
              />
              <p className="mt-1 text-xs text-fg-subtle">
                Host:port only — no <code className="text-fg-muted">turn:</code> prefix.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Username
              </label>
              <input
                type="text"
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue font-mono"
                value={draft.turnServerUser}
                onChange={(e) => setProp('turnServerUser', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Credential
              </label>
              <input
                type="password"
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue font-mono"
                value={draft.turnServerPass}
                onChange={(e) => setProp('turnServerPass', e.target.value)}
              />
            </div>
          </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-border-default">
            <button
              className="px-3 py-1.5 rounded border border-border-default text-xs text-fg-muted hover:border-fg-muted hover:text-fg-default transition-colors"
              onClick={() => window.nmtrAPI.checkForUpdates()}
            >
              Check for Updates
            </button>
            <div className="flex gap-2">
              <button
                className="px-4 py-1.5 rounded border border-border-default text-base text-fg-muted hover:border-fg-muted hover:text-fg-default transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="px-4 py-1.5 rounded bg-accent-blue text-white text-base font-semibold hover:opacity-90 transition-opacity"
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
