import React, { useMemo, useState } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line
} from 'react-simple-maps'
// Bundled world topology (MIT) — zero network requests, works fully offline
import worldTopology from 'world-atlas/countries-110m.json'
import type { HopStats } from '@shared/types'

interface NetworkGeoMapProps {
  hops: HopStats[]
}

function rttColor(avg: number | null): string {
  if (avg === null) return '#6b7280'
  if (avg < 50)    return '#22c55e'
  if (avg < 150)   return '#eab308'
  return '#ef4444'
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

  // Only hops that have geo coordinates
  const geoHops = useMemo(
    () =>
      [...hops]
        .sort((a, b) => a.hopIndex - b.hopIndex)
        .filter((h) => h.enrichment?.lat != null && h.enrichment?.lng != null),
    [hops]
  )

  if (geoHops.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
        {hops.length === 0
          ? 'No hop data yet — start a trace to see the world map.'
          : 'Waiting for geo-location data…'}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden relative" style={{ background: '#0d1117' }}>
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 153 }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Country fills — static, no network */}
        <Geographies geography={worldTopology}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1e293b"
                stroke="#334155"
                strokeWidth={0.4}
                style={{
                  default: { outline: 'none' },
                  hover:   { outline: 'none' },
                  pressed: { outline: 'none' }
                }}
              />
            ))
          }
        </Geographies>

        {/* Path lines between consecutive geo-located hops */}
        {geoHops.slice(0, -1).map((hop, i) => {
          const next = geoHops[i + 1]
          return (
            <Line
              key={`line-${hop.hopIndex}-${next.hopIndex}`}
              from={[hop.enrichment!.lng!, hop.enrichment!.lat!]}
              to={[next.enrichment!.lng!, next.enrichment!.lat!]}
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              fill="transparent"
            />
          )
        })}

        {/* One marker per hop with geo data */}
        {geoHops.map((hop) => {
          const color = rttColor(hop.avg)
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
              {/* Outer ring */}
              <circle r={9} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1} />
              {/* Inner dot */}
              <circle r={5} fill={color} stroke="#0d1117" strokeWidth={1.5} />
              {/* Hop number label */}
              <text
                y={-13}
                textAnchor="middle"
                fill={color}
                fontSize={9}
                fontFamily="monospace"
                fontWeight={700}
              >
                {hop.hopIndex}
              </text>
            </Marker>
          )
        })}
      </ComposableMap>

      {/* Hover tooltip — positioned in map-relative coords */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 px-3 py-2 rounded-lg shadow-xl border border-border-default bg-canvas-overlay text-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8, minWidth: 160 }}
        >
          <div className="font-semibold text-fg-default mb-1">
            Hop {tooltip.hopIndex}
            {tooltip.ip && <span className="font-mono ml-1 text-fg-muted">— {tooltip.ip}</span>}
          </div>
          {tooltip.hostname && (
            <div className="text-fg-muted truncate max-w-[220px]">{tooltip.hostname}</div>
          )}
          {(tooltip.city || tooltip.countryCode) && (
            <div className="text-fg-subtle">
              {[tooltip.city, tooltip.countryCode].filter(Boolean).join(', ')}
            </div>
          )}
          {tooltip.isp && <div className="text-fg-subtle truncate max-w-[220px]">{tooltip.isp}</div>}
          <div
            className="mt-1 font-medium"
            style={{ color: rttColor(tooltip.avg) }}
          >
            {tooltip.avg !== null ? `avg ${tooltip.avg.toFixed(1)} ms` : 'timeout'}
            {tooltip.loss > 0 && ` · ${tooltip.loss.toFixed(0)}% loss`}
          </div>
        </div>
      )}
    </div>
  )
}
