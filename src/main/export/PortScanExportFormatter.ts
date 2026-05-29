import type { PortScanResult, PortInfo, PortScanExportFormat } from '../../shared/types'

function banner(p: PortInfo): string {
  return [p.product, p.version, p.extraInfo && `(${p.extraInfo})`].filter(Boolean).join(' ')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function formatPortScanExport(
  result: PortScanResult,
  format: PortScanExportFormat
): { content: string; mimeType: string; suggestedFilename: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `nmtr-ports-${result.target}-${timestamp}`

  switch (format) {
    case 'csv':
      return { content: toCsv(result), mimeType: 'text/csv', suggestedFilename: `${filename}.csv` }
    case 'json':
      return { content: JSON.stringify(result, null, 2), mimeType: 'application/json', suggestedFilename: `${filename}.json` }
    case 'html':
      return { content: toHtml(result), mimeType: 'text/html', suggestedFilename: `${filename}.html` }
  }
}

function toCsv(result: PortScanResult): string {
  const BOM = '﻿' // UTF-8 BOM for Excel
  const header = 'Port,Protocol,State,Service,Product,Version,ExtraInfo'
  const rows = result.ports.map((p) =>
    [
      p.port,
      p.protocol,
      p.state,
      `"${p.service ?? ''}"`,
      `"${p.product ?? ''}"`,
      `"${p.version ?? ''}"`,
      `"${p.extraInfo ?? ''}"`
    ].join(',')
  )
  const meta = `# nmtr port scan of ${result.target}${result.resolvedIp ? ` (${result.resolvedIp})` : ''} - ${new Date().toUTCString()}`
  return BOM + meta + '\n' + header + '\n' + rows.join('\n')
}

function toHtml(result: PortScanResult): string {
  const rows = result.ports
    .map((p) => {
      const stateClass = p.state.startsWith('open') ? 'open' : p.state === 'filtered' ? 'warn' : 'closed'
      return `
    <tr>
      <td>${p.port}/${esc(p.protocol)}</td>
      <td class="${stateClass}">${esc(p.state)}</td>
      <td>${esc(p.service ?? '')}</td>
      <td>${esc(banner(p))}</td>
    </tr>`
    })
    .join('')

  const openCount = result.ports.filter((p) => p.state.startsWith('open')).length

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>nmtr ports – ${esc(result.target)} – ${new Date().toUTCString()}</title>
<style>
  body{font-family:Consolas,monospace;background:#0d1117;color:#e6edf3;padding:20px}
  h1{font-size:14px;color:#7d8590}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th{background:#161b22;color:#7d8590;padding:6px 10px;text-align:left;border-bottom:1px solid #30363d;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:5px 10px;border-bottom:1px solid #21262d}
  .open{color:#3fb950}.warn{color:#d29922}.closed{color:#f85149}
  tr:hover td{background:#1a2030}
</style>
</head>
<body>
<h1>nmtr port scan of ${esc(result.target)}${result.resolvedIp ? ` (${esc(result.resolvedIp)})` : ''} &nbsp;·&nbsp; ${new Date().toUTCString()} &nbsp;·&nbsp; ${result.protocol.toUpperCase()} &nbsp;·&nbsp; ${openCount} open</h1>
<table>
<thead>
  <tr><th>Port</th><th>State</th><th>Service</th><th>Version / Banner</th></tr>
</thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`
}
