import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Maximize2, X } from 'lucide-react'

const formatBytes = (bytes: number): string => {
  if (bytes >= 1e9) return `${bytes / 1e9}GB`
  if (bytes >= 1e6) return `${bytes / 1e6}MB`
  if (bytes >= 1e3) return `${bytes / 1e3}kB`
  return `${bytes}B`
}

const CustomTooltip = ({ active, payload, unit }: any): React.JSX.Element | null => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-canvas-overlay p-3 border border-border-default rounded shadow-lg text-sm">
        <p className="font-semibold text-fg-default mb-1">Measurement #{data.index + 1}</p>
        {unit === 'bps' && <p className="text-accent-green font-mono">Speed: {data.value.toFixed(2)} Mbps</p>}
        {unit === 'ms' && <p className="text-accent-blue font-mono">Latency: {data.value.toFixed(1)} ms</p>}
      </div>
    )
  }
  return null
}

const ChartCard = ({ title, data, unit, color, count, total }: any): React.JSX.Element => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsModalOpen(false)
    }
    if (isModalOpen) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen])

  const chartData = data.map((pt: any, i: number) => ({
    index: i,
    value: unit === 'bps' ? (pt.bps ? pt.bps / 1e6 : 0) : (typeof pt === 'number' ? pt : pt.latency || 0),
    raw: pt
  }))

  const hasDetails = chartData.length > 0
  const gradientId = `color-${title.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <>
      <div className="bg-canvas-subtle border border-border-default rounded-xl mb-4 text-fg-default shadow-sm overflow-hidden">
        <div
          className={`p-4 ${hasDetails ? 'cursor-pointer hover:bg-canvas-hover transition-colors group' : ''}`}
          onClick={() => hasDetails && setIsModalOpen(true)}
        >
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium text-sm text-fg-default">
              {title} {count !== undefined && <span className="text-fg-muted font-mono">({count}/{total})</span>}
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted font-mono">{unit}</span>
              {hasDetails && (
                <Maximize2 className="w-4 h-4 text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>

          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f4a" />
                <XAxis dataKey="index" tick={false} axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8b8b98' }} />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#${gradientId})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {isModalOpen && hasDetails && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-canvas-subtle border border-border-default rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-border-default">
              <h3 className="text-xl font-bold text-fg-default">
                {title} {count !== undefined && <span className="text-fg-muted font-mono text-sm">({count}/{total})</span>}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-fg-muted hover:bg-canvas-hover rounded transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6 flex-1">
              <div className="h-64 sm:h-80 w-full mb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`${gradientId}-large`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f4a" />
                    <XAxis dataKey="index" tick={false} axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b8b98' }} />
                    <Tooltip content={<CustomTooltip unit={unit} />} />
                    <Area type="monotone" dataKey="value" stroke={color} strokeWidth={3} fillOpacity={1} fill={`url(#${gradientId}-large)`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead>
                    <tr className="border-b border-border-default">
                      <th className="py-3 px-4 text-center font-semibold text-fg-default w-16 border-r border-border-default">#</th>
                      {unit === 'bps' && <th className="py-3 px-4 font-semibold text-fg-default border-r border-border-default">Duration</th>}
                      <th className="py-3 px-4 font-semibold text-fg-default">{unit === 'bps' ? 'Speed' : 'Latency'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((pt: any, i: number) => (
                      <tr key={i} className="border-b border-border-default last:border-0 hover:bg-canvas-hover transition-colors">
                        <td className="py-3 px-4 text-center text-fg-muted font-mono border-r border-border-default">{i + 1}</td>
                        {unit === 'bps' && <td className="py-3 px-4 text-fg-default font-mono border-r border-border-default">{pt.raw.duration} ms</td>}
                        <td className="py-3 px-4 text-fg-default font-mono font-medium">
                          {unit === 'bps' ? `${pt.value.toFixed(2)} Mbps` : `${pt.value.toFixed(1)} ms`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function SpeedTestMeasurements({ rawData }: { rawData: any }): React.JSX.Element | null {
  if (!rawData) return null

  const downloadGroups: Record<string, any[]> = {}
  if (rawData.download && Array.isArray(rawData.download)) {
    rawData.download.forEach((point: any) => {
      if (!point?.bytes || !point?.bps) return
      const key = String(point.bytes)
      if (!downloadGroups[key]) downloadGroups[key] = []
      downloadGroups[key].push(point)
    })
  }

  const uploadGroups: Record<string, any[]> = {}
  if (rawData.upload && Array.isArray(rawData.upload)) {
    rawData.upload.forEach((point: any) => {
      if (!point?.bytes || !point?.bps) return
      const key = String(point.bytes)
      if (!uploadGroups[key]) uploadGroups[key] = []
      uploadGroups[key].push(point)
    })
  }

  const unloadedLatency = rawData.latency || []
  const downLoadedLatency = rawData.downLoadedLatency || []
  const upLoadedLatency = rawData.upLoadedLatency || []
  const packetLoss = rawData.packetLoss

  return (
    <div className="bg-canvas-subtle rounded-xl shadow-2xl p-6 border border-border-default">
      <h2 className="font-bold text-2xl mb-8 text-fg-default">Detailed Measurements</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Download Column */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-fg-default">Download Measurements</h3>
          {Object.entries(downloadGroups).map(([bytes, bpsList]) => (
            <ChartCard
              key={bytes}
              title={`${formatBytes(Number(bytes))} download`}
              data={bpsList}
              unit="bps"
              color="#34d399"
              count={bpsList.length}
              total={bpsList.length}
            />
          ))}
        </div>

        {/* Upload Column */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-fg-default">Upload Measurements</h3>
          {Object.entries(uploadGroups).map(([bytes, bpsList]) => (
            <ChartCard
              key={bytes}
              title={`${formatBytes(Number(bytes))} upload`}
              data={bpsList}
              unit="bps"
              color="#a855f7"
              count={bpsList.length}
              total={bpsList.length}
            />
          ))}
        </div>

        {/* Latency Column */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-fg-default">Latency Measurements</h3>
          {unloadedLatency.length > 0 && (
            <ChartCard
              title="Unloaded latency"
              data={unloadedLatency}
              unit="ms"
              color="#3B82F6"
              count={unloadedLatency.length}
              total={unloadedLatency.length}
            />
          )}
          {downLoadedLatency.length > 0 && (
            <ChartCard
              title="Latency during download"
              data={downLoadedLatency}
              unit="ms"
              color="#fb923c"
              count={downLoadedLatency.length}
              total={downLoadedLatency.length}
            />
          )}
          {upLoadedLatency.length > 0 && (
            <ChartCard
              title="Latency during upload"
              data={upLoadedLatency}
              unit="ms"
              color="#a855f7"
              count={upLoadedLatency.length}
              total={upLoadedLatency.length}
            />
          )}

          {packetLoss && packetLoss.numMessages > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4 text-fg-default">Packet Loss</h3>
              <div className="bg-canvas-subtle border border-border-default rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-sm text-fg-default font-mono">
                    {packetLoss.numMessages}/{packetLoss.numMessages} packets
                  </h4>
                </div>
                <div className="w-full h-8 rounded overflow-hidden flex">
                  <div
                    className="h-full bg-accent-green flex items-center justify-center text-canvas-inset text-xs font-bold"
                    style={{ width: `${(1 - packetLoss.lossRatio) * 100}%` }}
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span>Received</span>
                      <span>{((1 - packetLoss.lossRatio) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  {packetLoss.lossRatio > 0 && (
                    <div
                      className="h-full bg-accent-red flex items-center justify-center text-white text-xs font-bold"
                      style={{ width: `${packetLoss.lossRatio * 100}%` }}
                    >
                      <div className="flex flex-col items-center leading-tight">
                        <span>Lost</span>
                        <span>{(packetLoss.lossRatio * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
