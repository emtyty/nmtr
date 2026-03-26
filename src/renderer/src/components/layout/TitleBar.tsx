import React from 'react'
import { SettingsDialog } from '../dialogs/SettingsDialog'
import { useUIStore } from '../../store/useUIStore'

export function TitleBar(): React.JSX.Element {
  const { settingsOpen, openSettings, closeSettings } = useUIStore()

  return (
    <div className="drag-region flex h-9 items-center justify-between bg-canvas-subtle border-b border-border-default px-4 flex-shrink-0 select-none">
      {/* Left: logo + subtitle */}
      <div className="flex items-center gap-2 no-drag pointer-events-none">
        <span className="text-accent-blue font-bold text-lg tracking-widest">◈ nmtr</span>
        <span className="text-fg-muted text-base">Network Diagnostic Tool</span>
      </div>

      {/* Right: settings gear + window controls */}
      <div className="flex items-center gap-3 no-drag">
        <button
          className="text-fg-muted hover:text-fg-default transition-colors text-base leading-none"
          onClick={openSettings}
          title="Settings (Ctrl+,)"
        >
          ⚙
        </button>

        <div className="flex items-center gap-2">
          <button
            className="w-3 h-3 rounded-full bg-[#febc2e] hover:opacity-80 transition-opacity"
            onClick={() => window.nmtrAPI.windowMinimize()}
            title="Minimize"
          />
          <button
            className="w-3 h-3 rounded-full bg-[#28c840] hover:opacity-80 transition-opacity"
            onClick={() => window.nmtrAPI.windowMaximize()}
            title="Maximize"
          />
          <button
            className="w-3 h-3 rounded-full bg-[#ff5f57] hover:opacity-80 transition-opacity"
            onClick={() => window.nmtrAPI.windowClose()}
            title="Close"
          />
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onClose={closeSettings} />
    </div>
  )
}
