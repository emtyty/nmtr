import React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

interface ExportMenuProps {
  sessionId: string
}

export function ExportMenu({ sessionId }: ExportMenuProps): React.JSX.Element {
  async function handleExport(format: 'text' | 'csv' | 'html'): Promise<void> {
    try {
      await window.nmtrAPI.traceExport({ sessionId, format })
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="text-base px-3 py-1.5 rounded border border-border-default text-fg-muted hover:border-fg-muted hover:text-fg-default transition-colors">
          Export ↓
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-canvas-subtle border border-border-default rounded-md py-1 shadow-xl z-50 min-w-36 text-base"
          sideOffset={4}
        >
          <DropdownMenu.Item
            className="px-3 py-2 text-fg-default hover:bg-slate-700 cursor-pointer outline-none flex items-center justify-between gap-4"
            onSelect={() => handleExport('text')}
          >
            <span>Copy as Text</span>
            <span className="text-fg-subtle text-sm">Ctrl+E</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="px-3 py-2 text-fg-default hover:bg-slate-700 cursor-pointer outline-none"
            onSelect={() => handleExport('csv')}
          >
            Save as CSV
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="px-3 py-2 text-fg-default hover:bg-slate-700 cursor-pointer outline-none"
            onSelect={() => handleExport('html')}
          >
            Save as HTML
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
