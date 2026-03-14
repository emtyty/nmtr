import React from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { HopStats } from '@shared/types'
import { Sparkline } from './Sparkline'

interface HopRowProps {
  hop: HopStats
  onWhois: (ip: string) => void
  // Takes hopIndex so HopTable can pass the stable setter directly (no inline wrapper)
  onLatencyClick: (hopIndex: number) => void
}

function lossClass(loss: number): string {
  if (loss === 0) return 'text-accent-green'
  if (loss <= 10) return 'text-accent-yellow'
  return 'text-accent-red'
}

function fmtMs(v: number | null): string {
  if (v === null) return '—'
  return v.toFixed(1)
}

function HopRowInner({ hop, onWhois, onLatencyClick }: HopRowProps): React.JSX.Element {
  const hostDisplay = hop.hostname ?? hop.ip ?? '* * *'
  const isTimeout = hop.ip === null

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <tr className="border-b border-border-muted hover:bg-canvas-hover font-table text-base group">
          <td className="px-3 py-1.5 text-fg-muted overflow-hidden">{hop.hopIndex}</td>

          {/* Hostname / IP */}
          <td className="px-3 py-1.5 overflow-hidden">
            {isTimeout ? (
              <span className="text-fg-subtle italic">* * *</span>
            ) : (
              <>
                <div className="text-accent-blue truncate">{hostDisplay}</div>
                {hop.hostname && hop.ip && (
                  <div className="text-fg-muted text-sm truncate">{hop.ip}</div>
                )}
              </>
            )}
          </td>

          {/* AS / ISP */}
          <td className="px-3 py-1.5 text-sm text-fg-muted overflow-hidden">
            {hop.enrichment?.asn && (
              <>
                <div className="text-fg-subtle truncate">{hop.enrichment.asn}</div>
                <div className="truncate">{hop.enrichment.isp}</div>
              </>
            )}
          </td>

          {/* Geo */}
          <td className="px-3 py-1.5 text-sm text-fg-muted overflow-hidden">
            {hop.enrichment?.countryCode && (
              <span className="truncate block">
                {hop.enrichment.city ? `${hop.enrichment.city}, ` : ''}
                {hop.enrichment.countryCode}
              </span>
            )}
          </td>

          {/* Loss */}
          <td className={`px-3 py-1.5 text-right font-semibold overflow-hidden ${lossClass(hop.loss)}`}>
            {hop.loss.toFixed(1)}%
          </td>

          {/* Packet counts */}
          <td className="px-3 py-1.5 text-right text-fg-muted overflow-hidden">{hop.sent}</td>
          <td className="px-3 py-1.5 text-right text-fg-muted overflow-hidden">{hop.recv}</td>

          {/* RTT stats */}
          <td className="px-3 py-1.5 text-right text-fg-default overflow-hidden">{fmtMs(hop.best)}</td>
          <td className="px-3 py-1.5 text-right text-fg-default overflow-hidden">{fmtMs(hop.avg)}</td>
          <td className="px-3 py-1.5 text-right text-fg-default overflow-hidden">{fmtMs(hop.worst)}</td>
          <td className="px-3 py-1.5 text-right text-fg-default overflow-hidden">{fmtMs(hop.last)}</td>
          <td className="px-3 py-1.5 text-right text-fg-muted overflow-hidden">{fmtMs(hop.jitter)}</td>

          {/* Sparkline — click to open detail */}
          <td
            className="px-3 py-1.5 overflow-hidden cursor-pointer hover:bg-slate-700/40 transition-colors"
            onClick={() => onLatencyClick(hop.hopIndex)}
            title="Click for latency detail"
          >
            <Sparkline data={hop.sparkline} width={100} height={20} />
          </td>
        </tr>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-canvas-subtle border border-border-default rounded-md py-1 shadow-xl z-50 min-w-40 text-base">
          <ContextMenu.Item
            className="px-3 py-1.5 text-fg-default hover:bg-slate-700 cursor-pointer outline-none"
            onSelect={() => hop.ip && navigator.clipboard.writeText(hop.ip)}
          >
            Copy IP address
          </ContextMenu.Item>
          {hop.hostname && (
            <ContextMenu.Item
              className="px-3 py-1.5 text-fg-default hover:bg-slate-700 cursor-pointer outline-none"
              onSelect={() => navigator.clipboard.writeText(hop.hostname!)}
            >
              Copy hostname
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="my-1 border-t border-border-default" />
          <ContextMenu.Item
            className="px-3 py-1.5 text-fg-default hover:bg-slate-700 cursor-pointer outline-none disabled:opacity-40"
            disabled={!hop.ip}
            onSelect={() => hop.ip && onWhois(hop.ip)}
          >
            View WHOIS
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

// Memo: skip re-render when hop data hasn't changed.
// onWhois and onLatencyClick are stable setState refs from the parent.
export const HopRow = React.memo(HopRowInner)
