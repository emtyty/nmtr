import React, { useMemo, useState } from 'react'
import type { HopStats, RouteChangeEvent } from '@shared/types'

interface NetworkPathMapProps {
  hops: HopStats[]
  routeEvents: RouteChangeEvent[]
  onWhois: (ip: string) => void
}

interface TooltipState {
  hop: HopStats
  reroutes: RouteChangeEvent[]
  x: number
  y: number
}

function getNodeStyle(
  hop: HopStats,
  isFirst: boolean,
  isLast: boolean
): { fill: string; stroke: string; strokeWidth: number } {
  if (isFirst) return { fill: '#34d399', stroke: '#059669', strokeWidth: 1.5 }
  if (isLast)  return { fill: '#60a5fa', stroke: '#3b82f6', strokeWidth: 2 }
  if (hop.ip === null) return { fill: 'transparent', stroke: '#4b5563', strokeWidth: 1.5 }
  if (hop.loss >= 50)  return { fill: '#fbbf24', stroke: '#d97706', strokeWidth: 1.5 }
  if (hop.loss >= 10)  return { fill: '#f87171', stroke: '#ef4444', strokeWidth: 1.5 }
  if (hop.avg !== null && hop.avg >= 150) return { fill: '#f87171', stroke: '#ef4444', strokeWidth: 1.5 }
  if (hop.avg !== null && hop.avg >= 50)  return { fill: '#fbbf24', stroke: '#d97706', strokeWidth: 1.5 }
  return { fill: '#34d399', stroke: '#059669', strokeWidth: 1.5 }
}

function getEdgeStyle(to: HopStats): { stroke: string; strokeDash?: string } {
  if (to.ip === null) return { stroke: '#374151', strokeDash: '6 4' }
  if (to.loss >= 10)  return { stroke: '#7f1d1d' }
  return { stroke: '#374151' }
}

function LegendDot({
  fill, stroke, label
}: { fill: string; stroke: string; label: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg width={14} height={14}>
        <circle cx={7} cy={7} r={5.5} fill={fill} stroke={stroke} strokeWidth={1.5} />
      </svg>
      <span style={{ fontSize: 11, color: '#8b8b98' }}>{label}</span>
    </div>
  )
}

export function NetworkPathMap({ hops, routeEvents, onWhois }: NetworkPathMapProps): React.JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const sorted = useMemo(
    () => [...hops].sort((a, b) => a.hopIndex - b.hopIndex),
    [hops]
  )

  // Group reroute events by hop index
  const rerouteMap = useMemo(() => {
    const m = new Map<number, RouteChangeEvent[]>()
    for (const e of routeEvents) {
      const arr = m.get(e.hopIndex) ?? []
      arr.push(e)
      m.set(e.hopIndex, arr)
    }
    return m
  }, [routeEvents])

  if (hops.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8b8b98', fontSize: 14, background: '#1e1e24' }}>
        No hop data yet \u2014 start a trace to see the path graph.
      </div>
    )
  }

  const NODE_R    = 13
  const H_GAP     = 92
  const V_CENTER  = 115
  const LEFT_PAD  = 110
  const RIGHT_PAD = 110
  const SVG_HEIGHT = 260

  const totalWidth = LEFT_PAD + (sorted.length - 1) * H_GAP + RIGHT_PAD

  const firstHop = sorted[0]
  const lastHop  = sorted[sorted.length - 1]

  const sourceLabel =
    firstHop.enrichment?.city != null
      ? firstHop.enrichment.city +
        (firstHop.enrichment.countryCode != null ? ', ' + firstHop.enrichment.countryCode : '')
      : 'Source'

  const destLabel = lastHop.ip ?? '* * *'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
      background: '#1e1e24', overflow: 'hidden' }}>

      {/* Legend bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '10px 20px',
        borderBottom: '1px solid #3f3f4a', background: '#17171d', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#8b8b98', fontWeight: 600 }}>Path Visualization</span>
        <div style={{ display: 'flex', gap: 14, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
          <LegendDot fill="#34d399" stroke="#059669" label="Source / Good" />
          <LegendDot fill="#fbbf24" stroke="#d97706" label="Moderate" />
          <LegendDot fill="#f87171" stroke="#ef4444" label="High latency / Loss" />
          <LegendDot fill="transparent" stroke="#4b5563" label="No response" />
          <LegendDot fill="#60a5fa" stroke="#3b82f6" label="Destination" />
          {rerouteMap.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width={14} height={14}>
                <circle cx={7} cy={7} r={5.5} fill="transparent" stroke="#fb923c" strokeWidth={2} strokeDasharray="2 1" />
              </svg>
              <span style={{ fontSize: 11, color: '#fb923c' }}>
                Rerouted ({rerouteMap.size} hop{rerouteMap.size > 1 ? 's' : ''})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable SVG canvas */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '0 12px' }}>
        <svg width={Math.max(totalWidth, 500)} height={SVG_HEIGHT}
          style={{ display: 'block', overflow: 'visible' }}>

          {/* Edges */}
          {sorted.slice(0, -1).map((_, i) => {
            const to = sorted[i + 1]
            const x1 = LEFT_PAD + i * H_GAP
            const x2 = LEFT_PAD + (i + 1) * H_GAP
            const es = getEdgeStyle(to)
            return (
              <line key={'edge-' + i}
                x1={x1 + NODE_R} y1={V_CENTER}
                x2={x2 - NODE_R} y2={V_CENTER}
                stroke={es.stroke} strokeWidth={2.5}
                strokeDasharray={es.strokeDash} />
            )
          })}

          {/* Nodes */}
          {sorted.map((hop, i) => {
            const isFirst = i === 0
            const isLast  = i === sorted.length - 1
            const cx      = LEFT_PAD + i * H_GAP
            const cy      = V_CENTER
            const style   = getNodeStyle(hop, isFirst, isLast)
            const reroutes = rerouteMap.get(hop.hopIndex) ?? []
            const isRerouted = reroutes.length > 0

            const prev  = i > 0 ? sorted[i - 1] : null
            const delta = prev != null && prev.avg != null && hop.avg != null
              ? hop.avg - prev.avg : null
            const hasLoss = hop.loss > 0 && hop.ip !== null

            // Most recent old IP for ghost label
            const lastReroute = reroutes.length > 0
              ? reroutes[reroutes.length - 1] : null

            return (
              <g key={'hop-' + hop.hopIndex}>

                {/* ── Reroute ring (amber dashed) ── */}
                {isRerouted && (
                  <circle cx={cx} cy={cy} r={NODE_R + 8}
                    fill="none" stroke="#fb923c" strokeWidth={1.5}
                    strokeDasharray="3 2" opacity={0.8} />
                )}

                {/* Glow ring \u2014 source */}
                {isFirst && (
                  <circle cx={cx} cy={cy} r={NODE_R + 6}
                    fill="none" stroke="#34d399" strokeWidth={1} opacity={0.25} />
                )}

                {/* Outer ring \u2014 destination */}
                {isLast && (
                  <circle cx={cx} cy={cy} r={NODE_R + 5}
                    fill="none" stroke="#3b82f6" strokeWidth={1.5} opacity={0.5} />
                )}

                {/* Main node circle */}
                <circle cx={cx} cy={cy} r={NODE_R}
                  fill={style.fill} stroke={style.stroke} strokeWidth={style.strokeWidth}
                  style={{ cursor: hop.ip != null ? 'pointer' : 'default' }}
                  onClick={() => hop.ip != null && onWhois(hop.ip)}
                  onMouseEnter={(e) => setTooltip({ hop, reroutes, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)} />

                {/* Inner dot \u2014 source */}
                {isFirst && (
                  <circle cx={cx} cy={cy} r={5} fill="#1e1e24"
                    style={{ pointerEvents: 'none' }} />
                )}

                {/* Reroute count badge */}
                {isRerouted && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle cx={cx + NODE_R - 1} cy={cy - NODE_R + 1} r={7}
                      fill="#fb923c" />
                    <text x={cx + NODE_R - 1} y={cy - NODE_R + 5}
                      textAnchor="middle" fontSize={8} fontWeight={700}
                      fill="#1e1e24">
                      {reroutes.length <= 9 ? '\u21bb' + reroutes.length : '!'}
                    </text>
                  </g>
                )}

                {/* Hop number above */}
                <text x={cx} y={cy - NODE_R - (isRerouted ? 14 : 7)}
                  textAnchor="middle" fontSize={10} fill="#4b5563"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {hop.hopIndex}
                </text>

                {/* Ghost label \u2014 previous IP after reroute */}
                {isRerouted && lastReroute != null && (
                  <text x={cx} y={cy - NODE_R - 25}
                    textAnchor="middle" fontSize={8} fill="#fb923c" opacity={0.7}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {'was ' + lastReroute.oldIP}
                  </text>
                )}

                {/* RTT delta above edge midpoint */}
                {delta !== null && i > 0 && (
                  <text x={cx - H_GAP / 2} y={cy - 18}
                    textAnchor="middle" fontSize={9}
                    fill={delta > 100 ? '#f87171' : delta > 30 ? '#fbbf24' : '#4b5563'}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {(delta > 0 ? '+' : '') + delta.toFixed(0) + ' ms'}
                  </text>
                )}

                {/* RTT below node */}
                <text x={cx} y={cy + NODE_R + 16}
                  textAnchor="middle" fontSize={10} fill="#6b6b78"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {hop.avg !== null ? hop.avg.toFixed(0) + ' ms' : hop.ip != null ? '?' : '*'}
                </text>

                {/* Loss badge */}
                {hasLoss && (
                  <text x={cx} y={cy + NODE_R + 29}
                    textAnchor="middle" fontSize={9} fill="#ef4444"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {hop.loss.toFixed(0) + '% loss'}
                  </text>
                )}

                {/* Source / Destination label */}
                {(isFirst || isLast) && (
                  <text x={cx} y={cy + NODE_R + (hasLoss ? 43 : 31)}
                    textAnchor="middle"
                    fontSize={isFirst ? 11 : 10}
                    fontWeight={600}
                    fill={isFirst ? '#34d399' : '#60a5fa'}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {isFirst ? sourceLabel : destLabel}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Hover tooltip */}
      {tooltip != null && (
        <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 14,
          background: '#17171d', border: '1px solid #3f3f4a', borderRadius: 6,
          padding: '8px 12px', fontSize: 11, color: '#e2e2e8',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)', pointerEvents: 'none',
          zIndex: 9999, minWidth: 190, lineHeight: '1.6' }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>
            {'Hop ' + tooltip.hop.hopIndex}
          </div>
          <div style={{ color: '#60a5fa', marginBottom: 2 }}>
            {tooltip.hop.ip ?? '* * *'}
          </div>
          {tooltip.hop.hostname != null && (
            <div style={{ color: '#8b8b98', fontSize: 10 }}>{tooltip.hop.hostname}</div>
          )}
          {tooltip.hop.enrichment?.isp != null && (
            <div style={{ color: '#8b8b98', fontSize: 10 }}>{tooltip.hop.enrichment.isp}</div>
          )}
          {tooltip.hop.enrichment?.city != null && (
            <div style={{ color: '#8b8b98', fontSize: 10 }}>
              {tooltip.hop.enrichment.city +
                (tooltip.hop.enrichment.countryCode != null
                  ? ', ' + tooltip.hop.enrichment.countryCode : '')}
            </div>
          )}
          {tooltip.reroutes.length > 0 && (
            <div style={{ marginTop: 5, borderTop: '1px solid #3f3f4a', paddingTop: 5 }}>
              <div style={{ color: '#fb923c', fontWeight: 600, marginBottom: 3 }}>
                {'\u21bb Rerouted ' + tooltip.reroutes.length + '\u00d7'}
              </div>
              {tooltip.reroutes.slice(-3).map((r, i) => (
                <div key={i} style={{ color: '#8b8b98', fontSize: 10 }}>
                  {r.oldIP + ' \u2192 ' + r.newIP}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 5, borderTop: '1px solid #3f3f4a', paddingTop: 5 }}>
            {tooltip.hop.avg !== null ? (
              <span>
                <span style={{ color: '#34d399' }}>{tooltip.hop.avg.toFixed(1) + ' ms'}</span>
                <span style={{ color: '#6b6b78' }}> avg</span>
                {tooltip.hop.best !== null && (
                  <span style={{ color: '#6b6b78', marginLeft: 6 }}>
                    {'\u00b7 best ' + tooltip.hop.best.toFixed(0) + ' ms'}
                  </span>
                )}
              </span>
            ) : <span style={{ color: '#6b6b78' }}>no response</span>}
            {tooltip.hop.loss > 0 && (
              <div style={{ color: '#f87171', marginTop: 2 }}>
                {tooltip.hop.loss.toFixed(0) + '% packet loss'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
