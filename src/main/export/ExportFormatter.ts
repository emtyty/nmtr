import type { HopStats, TraceConfig, ExportFormat } from '../../shared/types'

function pad(s: string | number | null, width: number, right = false): string {
  const str = s === null || s === undefined ? '---' : String(s)
  if (right) return str.padStart(width)
  return str.padEnd(width)
}

function formatMs(v: number | null): string {
  return v === null ? '---' : v.toFixed(1)
}

export function formatExport(
  hops: HopStats[],
  config: TraceConfig,
  format: ExportFormat
): { content: string; mimeType: string; suggestedFilename: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `nmtr-${config.target}-${timestamp}`

  switch (format) {
    case 'text':
      return { content: toText(hops, config), mimeType: 'text/plain', suggestedFilename: `${filename}.txt` }
    case 'csv':
      return { content: toCsv(hops, config), mimeType: 'text/csv', suggestedFilename: `${filename}.csv` }
    case 'html':
      return { content: toHtml(hops, config), mimeType: 'text/html', suggestedFilename: `${filename}.html` }
  }
}

function toText(hops: HopStats[], config: TraceConfig): string {
  const lines: string[] = [
    `nmtr trace to ${config.target}`,
    `Date: ${new Date().toUTCString()}`,
    `Protocol: ${config.protocol.toUpperCase()}  Interval: ${config.intervalMs}ms  MaxHops: ${config.maxHops}`,
    '',
    `${pad('#', 4)} ${pad('Hostname', 30)} ${pad('Loss%', 7)} ${pad('Sent', 6)} ${pad('Recv', 6)} ${pad('Best', 7)} ${pad('Avg', 7)} ${pad('Worst', 7)} ${pad('Last', 7)} ${pad('Jitter', 7)}`,
    '-'.repeat(90)
  ]

  for (const hop of hops) {
    const host = hop.hostname ?? hop.ip ?? '???'
    lines.push(
      `${pad(hop.hopIndex, 4)} ${pad(host, 30)} ${pad(hop.loss.toFixed(1) + '%', 7)} ${pad(hop.sent, 6)} ${pad(hop.recv, 6)} ${pad(formatMs(hop.best), 7)} ${pad(formatMs(hop.avg), 7)} ${pad(formatMs(hop.worst), 7)} ${pad(formatMs(hop.last), 7)} ${pad(formatMs(hop.jitter), 7)}`
    )
  }

  return lines.join('\n')
}

function toCsv(hops: HopStats[], config: TraceConfig): string {
  const BOM = '\uFEFF' // UTF-8 BOM for Excel
  const header = 'Hop,Hostname,IP,ASN,ISP,Country,City,Loss%,Sent,Recv,Best(ms),Avg(ms),Worst(ms),Last(ms),Jitter(ms)'
  const rows = hops.map((h) =>
    [
      h.hopIndex,
      `"${h.hostname ?? ''}"`,
      h.ip ?? '',
      h.enrichment?.asn ?? '',
      `"${h.enrichment?.isp ?? ''}"`,
      h.enrichment?.countryCode ?? '',
      `"${h.enrichment?.city ?? ''}"`,
      h.loss.toFixed(1),
      h.sent,
      h.recv,
      formatMs(h.best),
      formatMs(h.avg),
      formatMs(h.worst),
      formatMs(h.last),
      formatMs(h.jitter)
    ].join(',')
  )
  const meta = `# nmtr trace to ${config.target} - ${new Date().toUTCString()}`
  return BOM + meta + '\n' + header + '\n' + rows.join('\n')
}

function toHtml(hops: HopStats[], config: TraceConfig): string {
  const rows = hops
    .map((h) => {
      const lossClass =
        h.loss === 0 ? 'good' : h.loss <= 10 ? 'warn' : 'bad'
      return `
    <tr>
      <td>${h.hopIndex}</td>
      <td>${h.hostname ?? (h.ip ?? '* * *')}<br><small>${h.ip ?? ''}</small></td>
      <td>${h.enrichment?.asn ?? ''}<br><small>${h.enrichment?.isp ?? ''}</small></td>
      <td>${h.enrichment?.city ? `${h.enrichment.city}, ${h.enrichment.countryCode}` : (h.enrichment?.countryCode ?? '')}</td>
      <td class="${lossClass}">${h.loss.toFixed(1)}%</td>
      <td>${h.sent}</td><td>${h.recv}</td>
      <td>${formatMs(h.best)}</td><td>${formatMs(h.avg)}</td>
      <td>${formatMs(h.worst)}</td><td>${formatMs(h.last)}</td>
      <td>${formatMs(h.jitter)}</td>
    </tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>nmtr – ${config.target} – ${new Date().toUTCString()}</title>
<style>
  body{font-family:Consolas,monospace;background:#0d1117;color:#e6edf3;padding:20px}
  h1{font-size:14px;color:#7d8590}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th{background:#161b22;color:#7d8590;padding:6px 10px;text-align:left;border-bottom:1px solid #30363d;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:5px 10px;border-bottom:1px solid #21262d}
  small{color:#7d8590;font-size:10px}
  .good{color:#3fb950}.warn{color:#d29922}.bad{color:#f85149}
  tr:hover td{background:#1a2030}
</style>
</head>
<body>
<h1>nmtr trace to ${config.target} &nbsp;·&nbsp; ${new Date().toUTCString()} &nbsp;·&nbsp; Protocol: ${config.protocol.toUpperCase()}</h1>
<table>
<thead>
  <tr><th>#</th><th>Hostname / IP</th><th>AS / ISP</th><th>Geo</th><th>Loss%</th><th>Sent</th><th>Recv</th><th>Best</th><th>Avg</th><th>Worst</th><th>Last</th><th>Jitter</th></tr>
</thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`
}
