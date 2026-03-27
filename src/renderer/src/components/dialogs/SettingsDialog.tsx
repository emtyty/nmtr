import React, { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { AppSettings, Theme, Protocol } from '@shared/types'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps): React.JSX.Element {
  const { settings, update } = useSettingsStore()
  const [draft, setDraft] = useState<AppSettings>(settings)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open])

  async function handleSave(): Promise<void> {
    await update(draft)
    onClose()
  }

  function setProp<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas-subtle border border-border-default rounded-lg w-[440px] flex flex-col z-50 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <Dialog.Title className="text-base font-semibold text-fg-default">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-fg-muted hover:text-fg-default text-lg leading-none">×</button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
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

            {/* Default Protocol */}
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-widest mb-1.5">
                Default Protocol
              </label>
              <select
                className="w-full bg-canvas-default border border-border-default rounded px-3 py-1.5 text-base text-fg-default outline-none focus:border-accent-blue"
                value={draft.defaultProtocol}
                onChange={(e) => setProp('defaultProtocol', e.target.value as Protocol)}
              >
                <option value="icmp">ICMP</option>
                <option value="udp">UDP</option>
                <option value="tcp">TCP</option>
              </select>
            </div>

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
                  checked={draft.resolveHostnames}
                  onChange={(e) => setProp('resolveHostnames', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Resolve Hostnames</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.minimizeToTray}
                  onChange={(e) => setProp('minimizeToTray', e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
                <span className="text-base text-fg-default">Minimize to Tray on Close</span>
              </label>
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
