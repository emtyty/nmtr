import type { PubScanResult, PubScanExportFormat, PubFinding } from '../../shared/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

export function formatPubScanExport(
  result: PubScanResult,
  format: PubScanExportFormat
): { content: string; mimeType: string; suggestedFilename: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `nmtr-webscan-${result.domain}-${timestamp}`

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

function toText(r: PubScanResult): string {
  const lines: string[] = []
  lines.push(`Public web-security scan of ${r.domain}`)
  lines.push(`URL:    ${r.finalUrl}${r.ip ? ` (${r.ip})` : ''}`)
  lines.push(`Grade:  ${r.grade}  (score ${r.score}/100)`)
  lines.push(`When:   ${new Date().toUTCString()}`)
  lines.push('')

  lines.push(';; Category grades')
  for (const g of r.categoryGrades) lines.push(`${g.category.padEnd(10)} ${g.grade}`)
  lines.push('')

  if (r.tls) {
    lines.push(';; TLS')
    lines.push(`HTTPS:      ${r.tls.https ? 'yes' : 'no'}`)
    lines.push(`Protocol:   ${r.tls.protocol ?? '—'}`)
    lines.push(`Trusted:    ${r.tls.trusted ? 'yes' : 'no'}  ·  Hostname: ${r.tls.hostnameMatch ? 'ok' : 'mismatch'}`)
    lines.push(`Cert:       ${r.tls.certSubject ?? '—'} (issuer ${r.tls.certIssuer ?? '—'})`)
    lines.push(`Expires:    ${r.tls.validTo ?? '—'}${r.tls.daysRemaining !== null ? ` (${r.tls.daysRemaining}d)` : ''}`)
    lines.push('')
  }

  lines.push(';; Security headers')
  for (const h of r.headers) lines.push(`${h.status.toUpperCase().padEnd(5)} ${h.name.padEnd(28)} ${h.value ?? 'absent'}`)
  lines.push('')

  if (r.cookies.length > 0) {
    lines.push(';; Cookies')
    for (const c of r.cookies) lines.push(`${c.name.padEnd(24)} Secure=${c.secure} HttpOnly=${c.httpOnly} SameSite=${c.sameSite ?? '—'}`)
    lines.push('')
  }

  if (r.tech.length > 0) {
    lines.push(';; Software fingerprint')
    for (const t of r.tech) lines.push(`${t.category.padEnd(12)} ${t.name}${t.version ? ` ${t.version}` : ''}`)
    lines.push('')
  }

  if (r.thirdParty.length > 0) {
    lines.push(';; Third-party origins')
    for (const t of r.thirdParty) lines.push(`${t.tracker ? '[tracker] ' : ''}${t.host} (${t.kinds.join(', ')}, ${t.count})`)
    lines.push('')
  }

  lines.push(';; Compliance')
  for (const c of r.compliance) {
    lines.push(`${c.framework.padEnd(14)} ${c.status.toUpperCase()}  ${c.notes.join(' ')}`)
    for (const d of c.details) lines.push(`               - ${d}`)
  }
  lines.push('')

  if (r.findings.length > 0) {
    lines.push(';; Findings')
    for (const f of sortFindings(r.findings)) lines.push(`[${f.severity.toUpperCase()}] (${f.category}) ${f.title} — ${f.detail}`)
  }
  return lines.join('\n').trimEnd() + '\n'
}

function toCsv(r: PubScanResult): string {
  const BOM = '﻿'
  const header = 'Section,Key,Value'
  const rows: string[] = []
  const row = (section: string, key: string, value: string): void => {
    rows.push([csvCell(section), csvCell(key), csvCell(value)].join(','))
  }
  row('summary', 'domain', r.domain)
  row('summary', 'url', r.finalUrl)
  row('summary', 'grade', r.grade)
  row('summary', 'score', String(r.score))
  for (const g of r.categoryGrades) row('category', g.category, g.grade)
  if (r.tls) {
    row('tls', 'protocol', r.tls.protocol ?? '—')
    row('tls', 'trusted', r.tls.trusted ? 'yes' : 'no')
    row('tls', 'hostnameMatch', r.tls.hostnameMatch ? 'yes' : 'no')
    row('tls', 'expires', r.tls.validTo ?? '—')
  }
  for (const h of r.headers) row('header', h.name, `${h.status}: ${h.value ?? 'absent'}`)
  for (const c of r.cookies) row('cookie', c.name, `Secure=${c.secure} HttpOnly=${c.httpOnly} SameSite=${c.sameSite ?? '—'}`)
  for (const t of r.tech) row('tech', t.category, `${t.name}${t.version ? ` ${t.version}` : ''}`)
  for (const t of r.thirdParty) row('thirdParty', t.host, `${t.kinds.join('|')} x${t.count}${t.tracker ? ' tracker' : ''}`)
  for (const c of r.compliance) row('compliance', c.framework, `${c.status}: ${c.notes.join(' ')}${c.details.length ? ` [${c.details.join('; ')}]` : ''}`)
  for (const f of sortFindings(r.findings)) row('finding', f.severity, `[${f.category}] ${f.title}: ${f.detail}`)
  const meta = `# nmtr web-security scan of ${r.domain} - grade ${r.grade} (${r.score}/100) - ${new Date().toUTCString()}`
  return BOM + meta + '\n' + header + '\n' + rows.join('\n')
}

const SEV_ORDER: Record<PubFinding['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
function sortFindings(f: PubFinding[]): PubFinding[] {
  return [...f].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
}

const GRADE_COLOR: Record<string, string> = {
  'A+': '#3fb950', A: '#3fb950', B: '#d29922', C: '#d29922', D: '#f0883e', F: '#f85149'
}
const SEV_COLOR: Record<string, string> = {
  critical: '#f85149', high: '#f0883e', medium: '#d29922', low: '#58a6ff', info: '#7d8590'
}

function toHtml(r: PubScanResult): string {
  const catRows = r.categoryGrades
    .map((g) => `<tr><td class="mono">${g.category}</td><td><span class="grade-sm" style="background:${GRADE_COLOR[g.grade] ?? '#7d8590'}">${g.grade}</span></td></tr>`)
    .join('')
  const headerRows = r.headers
    .map((h) => `<tr><td class="sev sev-${h.status === 'fail' ? 'high' : h.status === 'warn' ? 'medium' : 'info'}">${h.status}</td><td class="mono">${esc(h.name)}</td><td class="note">${esc(h.value ?? h.note)}</td></tr>`)
    .join('')
  const findingRows = sortFindings(r.findings)
    .map((f) => `<tr><td class="sev sev-${f.severity}">${f.severity}</td><td>${esc(f.category)}</td><td>${esc(f.title)}</td><td class="note">${esc(f.detail)}${f.recommendation ? ` <em>${esc(f.recommendation)}</em>` : ''}</td></tr>`)
    .join('')
  const techRows = r.tech
    .map((t) => `<tr><td class="mono">${esc(t.category)}</td><td>${esc(t.name)}</td><td class="mono">${esc(t.version ?? '')}</td><td class="note">${esc(t.source)}</td></tr>`)
    .join('')
  const tpRows = r.thirdParty
    .map((t) => `<tr><td class="mono">${esc(t.host)}</td><td>${esc(t.kinds.join(', '))}</td><td>${t.count}</td><td>${t.tracker ? '<span style="color:#d29922">tracker</span>' : ''}</td></tr>`)
    .join('')
  const compRows = r.compliance
    .map((c) => {
      const detail = c.details.length ? `<ul style="margin:4px 0 0;padding-left:16px">${c.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''
      return `<tr><td>${esc(c.framework)}</td><td class="sev sev-${c.status === 'fail' ? 'high' : c.status === 'warn' ? 'medium' : 'info'}">${c.status}</td><td class="note">${esc(c.notes.join(' '))}${detail}</td></tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>nmtr web scan – ${esc(r.domain)} – ${new Date().toUTCString()}</title>
<style>
  body{font-family:Consolas,monospace;background:#0d1117;color:#e6edf3;padding:20px;font-size:12px}
  h1{font-size:14px;color:#7d8590;font-weight:600;display:flex;align-items:center;gap:12px}
  .grade{font-size:22px;font-weight:800;padding:2px 12px;border-radius:6px;color:#0d1117;background:${GRADE_COLOR[r.grade] ?? '#7d8590'}}
  .grade-sm{font-size:11px;font-weight:800;padding:1px 7px;border-radius:4px;color:#0d1117}
  section{margin:18px 0}
  h2{font-size:12px;color:#58a6ff;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #30363d;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;margin-top:6px}
  th{background:#161b22;color:#7d8590;padding:5px 10px;text-align:left;border-bottom:1px solid #30363d;font-size:10px;text-transform:uppercase}
  td{padding:4px 10px;border-bottom:1px solid #21262d;vertical-align:top}
  .mono{font-family:Consolas,monospace}
  .note{color:#7d8590}
  .sev{text-transform:uppercase;font-weight:700}
  .sev-critical{color:#f85149}.sev-high{color:#f0883e}.sev-medium{color:#d29922}.sev-low{color:#58a6ff}.sev-info{color:#7d8590}
</style>
</head>
<body>
<h1><span class="grade">${esc(r.grade)}</span> nmtr web-security scan of ${esc(r.domain)} &nbsp;·&nbsp; score ${r.score}/100 &nbsp;·&nbsp; ${new Date().toUTCString()}</h1>
<section><h2>Summary</h2><table>
  <tr><td>Final URL</td><td class="mono">${esc(r.finalUrl)}</td></tr>
  <tr><td>IP</td><td class="mono">${esc(r.ip ?? '—')}</td></tr>
  <tr><td>HTTP status</td><td>${r.statusCode ?? '—'}</td></tr>
  ${r.tls ? `<tr><td>TLS</td><td class="mono">${esc(r.tls.protocol ?? '—')} · ${r.tls.trusted ? 'trusted' : 'NOT trusted'} · ${r.tls.hostnameMatch ? 'hostname ok' : 'hostname mismatch'}</td></tr>` : ''}
</table></section>
<section><h2>Category grades</h2><table>${catRows}</table></section>
<section><h2>Compliance</h2><table><thead><tr><th>Framework</th><th>Status</th><th>Notes</th></tr></thead><tbody>${compRows}</tbody></table></section>
<section><h2>Security headers</h2><table><thead><tr><th>Status</th><th>Header</th><th>Value / note</th></tr></thead><tbody>${headerRows}</tbody></table></section>
${r.tech.length ? `<section><h2>Software fingerprint</h2><table><thead><tr><th>Category</th><th>Name</th><th>Version</th><th>Source</th></tr></thead><tbody>${techRows}</tbody></table></section>` : ''}
${r.thirdParty.length ? `<section><h2>Third-party origins</h2><table><thead><tr><th>Host</th><th>Kinds</th><th>Count</th><th></th></tr></thead><tbody>${tpRows}</tbody></table></section>` : ''}
${r.findings.length ? `<section><h2>Findings</h2><table><thead><tr><th>Severity</th><th>Category</th><th>Issue</th><th>Detail</th></tr></thead><tbody>${findingRows}</tbody></table></section>` : '<section><h2>Findings</h2><p>No issues detected.</p></section>'}
</body>
</html>`
}
