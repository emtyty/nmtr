import type { DnsLookupResult, DnsRecordSet, DnsExportFormat } from '../../shared/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function formatDnsExport(
  result: DnsLookupResult,
  format: DnsExportFormat
): { content: string; mimeType: string; suggestedFilename: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `nmtr-dns-${result.target}-${timestamp}`

  switch (format) {
    case 'csv':
      return { content: toCsv(result), mimeType: 'text/csv', suggestedFilename: `${filename}.csv` }
    case 'json':
      return { content: JSON.stringify(result, null, 2), mimeType: 'application/json', suggestedFilename: `${filename}.json` }
    case 'html':
      return { content: toHtml(result), mimeType: 'text/html', suggestedFilename: `${filename}.html` }
    case 'text':
      return { content: toText(result), mimeType: 'text/plain', suggestedFilename: `${filename}.txt` }
  }
}

function toText(result: DnsLookupResult): string {
  const lines: string[] = []
  lines.push(`DNS lookup of ${result.target}${result.queriedName !== result.target ? ` (${result.queriedName})` : ''}`)
  lines.push(`Resolver: ${result.resolver}${result.authoritative ? ' (authoritative)' : ''}`)
  lines.push(`DNSSEC: ${result.dnssec.status}${result.dnssec.adFlag ? ' (AD)' : ''}`)
  lines.push(`When: ${new Date().toUTCString()}`)
  lines.push('')
  for (const set of result.sets) {
    if (set.records.length === 0) continue
    lines.push(`;; ${set.type}`)
    for (const r of set.records) {
      lines.push(`${(r.name || '.').padEnd(28)} ${String(r.ttl).padStart(6)}  ${set.type.padEnd(7)} ${r.value}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function toCsv(result: DnsLookupResult): string {
  const BOM = '﻿' // UTF-8 BOM for Excel
  const header = 'Type,Name,TTL,Value'
  const rows: string[] = []
  for (const set of result.sets) {
    for (const r of set.records) {
      rows.push([set.type, csvCell(r.name), r.ttl, csvCell(r.value)].join(','))
    }
  }
  const meta = `# nmtr DNS lookup of ${result.target} via ${result.resolver} - ${new Date().toUTCString()}`
  return BOM + meta + '\n' + header + '\n' + rows.join('\n')
}

function statusNote(set: DnsRecordSet): string {
  if (set.error) return `error: ${set.error}`
  if (set.records.length === 0) return set.rcode && set.rcode !== 'NOERROR' ? set.rcode : 'no records'
  return ''
}

function toHtml(result: DnsLookupResult): string {
  const sections = result.sets
    .map((set) => {
      const note = statusNote(set)
      const rows = set.records
        .map(
          (r) => `
      <tr>
        <td class="mono">${esc(r.name)}</td>
        <td class="ttl">${r.ttl}</td>
        <td class="mono val">${esc(r.value)}</td>
      </tr>`
        )
        .join('')
      return `
  <section>
    <h2>${set.type} <span class="count">${set.records.length}</span>${note ? `<span class="note">${esc(note)}</span>` : ''}</h2>
    ${set.records.length > 0
      ? `<table><thead><tr><th>Name</th><th>TTL</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`
      : ''}
  </section>`
    })
    .join('')

  const totalRecords = result.sets.reduce((n, s) => n + s.records.length, 0)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>nmtr DNS – ${esc(result.target)} – ${new Date().toUTCString()}</title>
<style>
  body{font-family:Consolas,monospace;background:#0d1117;color:#e6edf3;padding:20px;font-size:12px}
  h1{font-size:14px;color:#7d8590;font-weight:600}
  section{margin:18px 0}
  h2{font-size:12px;color:#58a6ff;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #30363d;padding-bottom:4px;display:flex;align-items:center;gap:8px}
  .count{color:#3fb950;font-size:11px}
  .note{color:#7d8590;font-weight:400;text-transform:none;letter-spacing:0}
  table{border-collapse:collapse;width:100%;margin-top:6px}
  th{background:#161b22;color:#7d8590;padding:5px 10px;text-align:left;border-bottom:1px solid #30363d;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:4px 10px;border-bottom:1px solid #21262d;vertical-align:top}
  .mono{font-family:Consolas,monospace}
  .ttl{color:#7d8590;width:80px}
  .val{color:#e6edf3;word-break:break-all}
</style>
</head>
<body>
<h1>nmtr DNS lookup of ${esc(result.target)}${result.queriedName !== result.target ? ` (${esc(result.queriedName)})` : ''} &nbsp;·&nbsp; resolver ${esc(result.resolver)} &nbsp;·&nbsp; ${new Date().toUTCString()} &nbsp;·&nbsp; ${totalRecords} record${totalRecords !== 1 ? 's' : ''}</h1>
${sections}
</body>
</html>`
}
