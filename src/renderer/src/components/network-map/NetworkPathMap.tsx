import React, { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { HopStats } from '@shared/types'

interface NetworkPathMapProps {
  hops: HopStats[]
  onWhois: (ip: string) => void
}

function rttColor(avg: number | null): string {
  if (avg === null) return '#6b7280' // gray — no data
  if (avg < 50) return '#22c55e'    // green
  if (avg < 150) return '#eab308'   // yellow
  return '#ef4444'                   // red
}

export function NetworkPathMap({ hops, onWhois }: NetworkPathMapProps): React.JSX.Element {
  const sorted = useMemo(
    () => [...hops].sort((a, b) => a.hopIndex - b.hopIndex),
    [hops]
  )

  const nodes: Node[] = useMemo(
    () =>
      sorted.map((hop, i) => ({
        id: String(hop.hopIndex),
        position: { x: 0, y: i * 90 },
        data: {
          label: (
            <div
              className="text-left cursor-pointer select-none"
              onClick={() => hop.ip && onWhois(hop.ip)}
            >
              <div className="font-semibold text-xs text-white">
                Hop {hop.hopIndex} {hop.ip ? `— ${hop.ip}` : '— * * *'}
              </div>
              {hop.hostname && (
                <div className="text-[10px] text-gray-300 truncate max-w-[180px]">
                  {hop.hostname}
                </div>
              )}
              <div className="text-[10px] mt-0.5" style={{ color: rttColor(hop.avg) }}>
                {hop.avg !== null ? `avg ${hop.avg.toFixed(1)} ms` : 'timeout'}
                {hop.loss > 0 && ` · ${hop.loss.toFixed(0)}% loss`}
              </div>
            </div>
          )
        },
        style: {
          background: '#1a1f2e',
          border: `2px solid ${rttColor(hop.avg)}`,
          borderRadius: 8,
          padding: '8px 12px',
          width: 220,
          fontSize: 12
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top
      })),
    [sorted, onWhois]
  )

  const edges: Edge[] = useMemo(
    () =>
      sorted.slice(0, -1).map((hop, i) => {
        const next = sorted[i + 1]
        const delta =
          hop.avg !== null && next.avg !== null ? next.avg - hop.avg : null
        return {
          id: `e${hop.hopIndex}-${next.hopIndex}`,
          source: String(hop.hopIndex),
          target: String(next.hopIndex),
          label: delta !== null ? `+${delta.toFixed(1)} ms` : '',
          style: { stroke: '#4b5563' },
          labelStyle: { fontSize: 10, fill: '#9ca3af' },
          labelBgStyle: { fill: '#0d1117', fillOpacity: 0.8 }
        }
      }),
    [sorted]
  )

  if (hops.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
        No hop data yet — start a trace to see the path graph.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden" style={{ background: '#0d1117' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        colorMode="dark"
      >
        <Background color="#1f2937" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
