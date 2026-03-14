import React, { useState, useCallback } from 'react'
import type { HopStats } from '@shared/types'
import { HopRow } from './HopRow'

interface ColDef {
  label: string
  defaultWidth: number
  minWidth: number
}

const COLUMNS: ColDef[] = [
  { label: '#', defaultWidth: 63, minWidth: 48 },
  { label: 'Hostname / IP', defaultWidth: 315, minWidth: 180 },
  { label: 'AS / ISP', defaultWidth: 240, minWidth: 150 },
  { label: 'Geo', defaultWidth: 180, minWidth: 120 },
  { label: 'Loss%', defaultWidth: 108, minWidth: 83 },
  { label: 'Sent', defaultWidth: 87, minWidth: 63 },
  { label: 'Recv', defaultWidth: 87, minWidth: 63 },
  { label: 'Best', defaultWidth: 102, minWidth: 75 },
  { label: 'Avg', defaultWidth: 102, minWidth: 75 },
  { label: 'Worst', defaultWidth: 102, minWidth: 75 },
  { label: 'Last', defaultWidth: 102, minWidth: 75 },
  { label: 'Jitter', defaultWidth: 102, minWidth: 75 },
  { label: 'Latency', defaultWidth: 195, minWidth: 120 }
]

interface HopTableProps {
  hops: HopStats[]
  onWhois: (ip: string) => void
  onLatencyClick: (hopIndex: number) => void
}

function HopTableInner({ hops, onWhois, onLatencyClick }: HopTableProps): React.JSX.Element {
  const [widths, setWidths] = useState<number[]>(COLUMNS.map((c) => c.defaultWidth))

  const onResizeStart = useCallback(
    (e: React.MouseEvent, colIdx: number) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = widths[colIdx]
      const minW = COLUMNS[colIdx].minWidth

      function onMove(ev: MouseEvent): void {
        const newW = Math.max(minW, startWidth + (ev.clientX - startX))
        setWidths((prev) => prev.map((w, i) => (i === colIdx ? newW : w)))
      }

      function onUp(): void {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [widths]
  )

  if (hops.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-subtle text-lg">
        Waiting for hops…
      </div>
    )
  }

  const totalWidth = widths.reduce((a, b) => a + b, 0)

  return (
    <div className="flex-1 overflow-auto">
      <table
        className="border-collapse text-base font-table"
        style={{ tableLayout: 'fixed', width: totalWidth }}
      >
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-canvas-subtle border-b border-border-default">
          <tr>
            {COLUMNS.map((col, i) => (
              <th
                key={col.label}
                className="relative px-3 py-2 text-left text-sm font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap select-none overflow-hidden"
              >
                <span className="block truncate pr-2">{col.label}</span>
                {/* Resize handle */}
                <div
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize group/resizer"
                  onMouseDown={(e) => onResizeStart(e, i)}
                >
                  <div className="absolute right-0 top-1/4 h-1/2 w-px bg-border-default group-hover/resizer:bg-accent-blue transition-colors" />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hops.map((hop) => (
            <HopRow
              key={hop.hopIndex}
              hop={hop}
              onWhois={onWhois}
              onLatencyClick={onLatencyClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Memo: prevents re-renders when parent updates for non-hop reasons (e.g. elapsed timer)
export const HopTable = React.memo(HopTableInner)
