import React, { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

interface WhoisDialogProps {
  ip: string | null
  onClose: () => void
}

export function WhoisDialog({ ip, onClose }: WhoisDialogProps): React.JSX.Element {
  const [data, setData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ip) return
    setLoading(true)
    setData(null)
    window.nmtrAPI.whoisFetch({ ip }).then((r) => {
      setData(r.raw)
      setLoading(false)
    })
  }, [ip])

  return (
    <Dialog.Root open={!!ip} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas-subtle border border-border-default rounded-lg w-[600px] max-h-[70vh] flex flex-col z-50 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <Dialog.Title className="text-base font-semibold text-fg-default">
              WHOIS — {ip}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-fg-muted hover:text-fg-default text-lg leading-none">×</button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {loading && <div className="text-fg-muted text-base">Loading…</div>}
            {data && (
              <pre className="text-xs text-fg-default font-mono whitespace-pre-wrap leading-5">{data}</pre>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
