import React, { useMemo, useState, useCallback } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
  ZoomableGroup
} from 'react-simple-maps'
import worldTopology from 'world-atlas/countries-110m.json'
import type { HopStats } from '@shared/types'

interface NetworkGeoMapProps {
  hops: HopStats[]
}

const PULSE_STYLE = `
@keyframes geo-ping {
  0%   { r: 8;  opacity: 0.8; }
  70%  { r: 22; opacity: 0;   }
  100% { r: 22; opacity: 0;   }
}
@keyframes geo-dash {
  to { stroke-dashoffset: -24; }
}
.geo-ping { animation: geo-ping 2s ease-out infinite; }
.geo-dash { animation: geo-dash 1.2s linear infinite; }
`

function rttColor(avg: number | null): string {
  if (avg === null) return '#6b6b78'
  if (avg < 50)    return '#34d399'
  if (avg < 150)   return '#fbbf24'
  return '#f87171'
}

interface ZoomState {
  zoom: number
  center: [number, number]
}

interface TooltipState {
  hopIndex: number
  ip: string | null
  hostname: string | null
  city: string | null
  countryCode: string | null
  isp: string | null
  avg: number | null
  loss: number
  x: number
  y: number
}

export function NetworkGeoMap({ hops }: NetworkGeoMapProps): React.JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [position, setPosition] = useState<ZoomState>({ zoom: 1, center: [0, 20] })

  const geoHops = useMemo(
    () =>
      [...hops]
        .sort((a, b) => a.hopIndex - b.hopIndex)
        .filter((h) => h.enrichment?.lat != null && h.enrichment?.lng != null),
    [hops]
  )

  const handleMoveEnd = useCallback((pos: { coordinates: [number, number]; zoom: number }) => {
    setPosition({ zoom: pos.zoom, center: pos.coordinates })
  }, [])

  const zoomIn  = () => setPosition(p => ({ ...p, zoom: Math.min(p.zoom * 1.6, 32) }))
  const zoomOut = () => setPosition(p => ({ ...p, zoom: Math.max(p.zoom / 1.6, 1) }))
  const reset   = () => setPosition({ zoom: 1, center: [0, 20] })

  if (geoHops.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-muted text-sm"
        style={{ background: '#1e1e24' }}>
        {hops.length === 0
          ? 'No hop data yet \u2014 start a trace to see the world map.'
          : 'Waiting for geo-location data\u2026'}
      </div>
    )
  }

  const totalHops = hops.length
  const geoTagged = geoHops.length
  const avgRtt    = geoHops.filter(h => h.avg != null).reduce((s, h) => s + h.avg!, 0) /
                    (geoHops.filter(h => h.avg != null).length || 1)
  const firstHop  = geoHops[0]
  const lastHop   = geoHops[geoHops.length - 1]

  return (
    <div className="flex-1 overflow-hidden flex flex-col" style={{ background: '#1e1e24' }}>
      <style>{PULSE_STYLE}</style>

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden">
        <ComposableMap
          projection="geoNaturalEarth1"
          projectionConfig={{ scale: 153 }}
          style={{ width: '100%', height: '100%' }}
        >
          <ZoomableGroup
            zoom={position.zoom}
            center={position.center}
            onMoveEnd={handleMoveEnd}
          >
            {/* Ocean */}
            <rect x={-4000} y={-3000} width={8000} height={6000} fill="#17171d" />

            {/* Countries */}
            <Geographies geography={worldTopology}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography key={geo.rsmKey} geography={geo}
                    fill="#2a2a32" stroke="#3f3f4a" strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover:   { outline: 'none' },
                      pressed: { outline: 'none' }
                    }} />
                ))
              }
            </Geographies>

            {/* Animated path lines */}
            {geoHops.slice(0, -1).map((hop, i) => {
              const next  = geoHops[i + 1]
              const color = rttColor(next.avg)
              return (
                <Line
                  key={'line-' + hop.hopIndex + '-' + next.hopIndex}
                  from={[hop.enrichment!.lng!, hop.enrichment!.lat!]}
                  to={[next.enrichment!.lng!, next.enrichment!.lat!]}
                  stroke={color}
                  strokeWidth={1.8}
                  strokeOpacity={0.65}
                  strokeDasharray="8 4"
                  className="geo-dash"
                  fill="transparent"
                />
              )
            })}

            {/* Markers */}
            {geoHops.map((hop, i) => {
              const color   = rttColor(hop.avg)
              const isFirst = i === 0
              const isLast  = i === geoHops.length - 1
              return (
                <Marker
                  key={hop.hopIndex}
                  coordinates={[hop.enrichment!.lng!, hop.enrichment!.lat!]}
                  onMouseEnter={(e: React.MouseEvent) => {
                    const rect = (e.currentTarget as SVGElement)
                      .closest('svg')!
                      .getBoundingClientRect()
                    setTooltip({
                      hopIndex: hop.hopIndex,
                      ip: hop.ip,
                      hostname: hop.hostname,
                      city: hop.enrichment?.city ?? null,
                      countryCode: hop.enrichment?.countryCode ?? null,
                      isp: hop.enrichment?.isp ?? null,
                      avg: hop.avg,
                      loss: hop.loss,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* Pulse ring on source */}
                  {isFirst && (
                    <circle r={8} fill="none" stroke="#34d399"
                      strokeWidth={1.5} className="geo-ping" />
                  )}
                  {/* Outer ring */}
                  <circle r={isFirst ? 9 : isLast ? 8 : 7}
                    fill={color} fillOpacity={0.15}
                    stroke={color} strokeWidth={1.2} />
                  {/* Inner dot */}
                  <circle r={isFirst ? 5 : isLast ? 4 : 3.5}
                    fill={color} stroke="#1e1e24" strokeWidth={1.5} />
                  {/* Hop number */}
                  <text y={-13} textAnchor="middle"
                    fill={color} fontSize={9} fontFamily="monospace" fontWeight={700}>
                    {hop.hopIndex}
                  </text>
                  {/* City label on first / last */}
                  {(isFirst || isLast) && hop.enrichment?.city != null && (
                    <text y={-23} textAnchor="middle"
                      fill="#e2e2e8" fontSize={8} fontWeight={500}>
                      {hop.enrichment.city +
                        (hop.enrichment.countryCode != null
                          ? ', ' + hop.enrichment.countryCode : '')}
                    </text>
                  )}
                </Marker>
              )
            })}
          </ZoomableGroup>
        </ComposableMap>

        {/* Zoom controls */}
        <div style={{ position: 'absolute', top: 12, right: 14,
          display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { label: '+', onClick: zoomIn,  title: 'Zoom in'    },
            { label: '\u2212', onClick: zoomOut, title: 'Zoom out'   },
            { label: '\u26f6', onClick: reset,   title: 'Reset view' }
          ].map(({ label, onClick, title }) => (
            <button
              key={label}
              onClick={onClick}
              title={title}
              style={{
                width: 28, height: 28,
                background: '#2a2a32',
                border: '1px solid #3f3f4a',
                borderRadius: 6,
                color: '#e2e2e8',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Hover tooltip */}
        {tooltip && (
          <div className="pointer-events-none absolute z-10 rounded-lg shadow-xl"
            style={{ left: tooltip.x + 12, top: tooltip.y - 8, minWidth: 170,
              background: '#17171d', border: '1px solid #3f3f4a',
              padding: '8px 12px', fontSize: 11, color: '#e2e2e8', lineHeight: '1.6' }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>
              {'Hop ' + tooltip.hopIndex}
              {tooltip.ip && (
                <span style={{ fontWeight: 400, color: '#60a5fa', marginLeft: 6 }}>
                  {tooltip.ip}
                </span>
              )}
            </div>
            {tooltip.hostname && <div style={{ color: '#8b8b98', fontSize: 10 }}>{tooltip.hostname}</div>}
            {(tooltip.city || tooltip.countryCode) && (
              <div style={{ color: '#8b8b98', fontSize: 10 }}>
                {[tooltip.city, tooltip.countryCode].filter(Boolean).join(', ')}
              </div>
            )}
            {tooltip.isp && <div style={{ color: '#8b8b98', fontSize: 10 }}>{tooltip.isp}</div>}
            <div style={{ marginTop: 5, borderTop: '1px solid #3f3f4a', paddingTop: 5,
              color: rttColor(tooltip.avg), fontWeight: 500 }}>
              {tooltip.avg !== null ? 'avg ' + tooltip.avg.toFixed(1) + ' ms' : 'timeout'}
              {tooltip.loss > 0 && (
                <span style={{ color: '#f87171', marginLeft: 8 }}>
                  {tooltip.loss.toFixed(0) + '% loss'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '8px 20px',
        borderTop: '1px solid #3f3f4a', background: '#17171d',
        flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#8b8b98' }}>
          <span style={{ color: '#e2e2e8', fontWeight: 600 }}>{geoTagged}</span>
          {' / ' + totalHops + ' hops geo-located'}
        </span>
        {firstHop.enrichment?.city && (
          <span style={{ fontSize: 11, color: '#8b8b98' }}>
            <span style={{ color: '#34d399', fontWeight: 500 }}>
              {firstHop.enrichment.city +
                (firstHop.enrichment.countryCode ? ', ' + firstHop.enrichment.countryCode : '')}
            </span>
            {' \u2192 '}
            <span style={{ color: '#60a5fa', fontWeight: 500 }}>
              {lastHop.enrichment?.city
                ? lastHop.enrichment.city +
                  (lastHop.enrichment.countryCode ? ', ' + lastHop.enrichment.countryCode : '')
                : lastHop.ip ?? '?'}
            </span>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b8b98' }}>
          {'avg RTT '}
          <span style={{ color: rttColor(avgRtt), fontWeight: 600 }}>
            {avgRtt.toFixed(1) + ' ms'}
          </span>
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {[
            { color: '#34d399', label: 'Good' },
            { color: '#fbbf24', label: 'Moderate' },
            { color: '#f87171', label: 'High' }
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill={color} /></svg>
              <span style={{ fontSize: 10, color: '#6b6b78' }}>{label}</span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 10, color: '#4b5563' }}>Scroll to zoom \u00b7 drag to pan</span>
      </div>
    </div>
  )
}
