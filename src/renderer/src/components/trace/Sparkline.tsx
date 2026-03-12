import React, { useMemo } from 'react'

interface SparklineProps {
  data: (number | null)[]
  width?: number
  height?: number
}

// Color thresholds
function latencyColor(avg: number | null): string {
  if (avg === null) return '#484f58'
  if (avg < 50) return '#3fb950'
  if (avg < 150) return '#d29922'
  return '#f85149'
}

export function Sparkline({ data, width = 100, height = 20 }: SparklineProps): React.JSX.Element {
  const points = useMemo(() => {
    const valid = data.filter((v): v is number => v !== null)
    if (valid.length === 0) return null
    const max = Math.max(...valid, 1)
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length

    const barW = width / data.length
    const bars: React.JSX.Element[] = []
    const color = latencyColor(avg)

    data.forEach((v, i) => {
      if (v === null) return
      const barH = Math.max(2, (v / max) * (height - 2))
      bars.push(
        <rect
          key={i}
          x={i * barW + 0.5}
          y={height - barH}
          width={Math.max(1, barW - 1)}
          height={barH}
          fill={color}
          opacity={0.85}
          rx={1}
        />
      )
    })
    return { bars, color }
  }, [data, width, height])

  if (!points) {
    return <svg width={width} height={height} />
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      {points.bars}
    </svg>
  )
}
