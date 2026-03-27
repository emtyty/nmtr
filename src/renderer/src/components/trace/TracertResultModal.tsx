import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useUIStore } from '../../store/useUIStore'

export function TracertResultModal(): React.JSX.Element {
  const { tracertModalOpen, tracertResult, closeTracertModal } = useUIStore()

  return (
    <Dialog.Root open={tracertModalOpen} onOpenChange={(o) => { if (!o) closeTracertModal() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] max-w-[95vw] max-h-[80vh] flex flex-col bg-canvas-default border border-border-default rounded-lg shadow-2xl">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border-muted flex-shrink-0">
            <span className="text-sm font-semibold text-fg-default">
              Tracert Discovery
              {tracertResult && (
                <span className="ml-2 text-fg-muted font-normal">→ {tracertResult.target}</span>
              )}
            </span>
            {tracertResult?.error && (
              <span className="ml-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-400">
                Error
              </span>
            )}
            {!tracertResult?.error && tracertResult && (
              <span className="ml-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/15 text-green-400">
                {tracertResult.hops.length} hop{tracertResult.hops.length !== 1 ? 's' : ''} found
              </span>
            )}
            <Dialog.Close className="ml-auto text-fg-subtle hover:text-fg-default transition-colors text-lg leading-none">
              ✕
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-0 overflow-hidden flex-1 min-h-0">
            {/* Error banner */}
            {tracertResult?.error && (
              <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs font-mono flex-shrink-0">
                {tracertResult.error}
              </div>
            )}

            {/* Parsed hops table — grows to fill available space, scrollable */}
            {tracertResult && tracertResult.hops.length > 0 && (
              <div className="flex flex-col flex-1 min-h-0 border-b border-border-muted">
                <div className="px-4 py-2 text-xs text-fg-subtle font-medium uppercase tracking-wider flex-shrink-0">
                  Parsed Hops ({tracertResult.hops.length})
                </div>
                <div className="overflow-y-auto flex-1 min-h-0">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-canvas-default">
                      <tr className="text-fg-subtle border-b border-border-muted">
                        <th className="text-left px-4 py-1 font-medium w-16">TTL</th>
                        <th className="text-left px-4 py-1 font-medium">IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tracertResult.hops.map(({ ttl, ip }) => (
                        <tr key={ttl} className="border-b border-border-muted/40 hover:bg-canvas-subtle">
                          <td className="px-4 py-1.5 text-fg-muted tabular-nums">{ttl}</td>
                          <td className="px-4 py-1.5 text-fg-default font-mono">{ip}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Raw output — fixed height, scrollable */}
            <div className="flex flex-col flex-shrink-0" style={{ maxHeight: '35%' }}>
              <div className="px-4 py-2 text-xs text-fg-subtle font-medium uppercase tracking-wider border-b border-border-muted flex-shrink-0">
                Raw Output
              </div>
              <pre className="overflow-auto px-4 py-3 text-xs font-mono text-fg-muted leading-relaxed whitespace-pre-wrap break-all flex-1 min-h-0">
                {tracertResult?.rawOutput || '(no output)'}
              </pre>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end px-4 py-3 border-t border-border-muted flex-shrink-0">
            <button
              onClick={closeTracertModal}
              className="px-4 py-1.5 text-sm rounded bg-canvas-subtle border border-border-default text-fg-default hover:bg-canvas-hover transition-colors"
            >
              Close
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
