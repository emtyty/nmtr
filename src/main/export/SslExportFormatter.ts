import type { SslScanResult, SslExportFormat, TlsCipher } from '../../shared/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

export function formatSslExport(
  result: SslScanResult,
  format: SslExportFormat
): { content: string; mimeType: string; suggestedFilename: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `nmtr-ssl-${result.host}-${timestamp}`

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

function toText(r: SslScanResult): string {
  const lines: string[] = []
  lines.push(`SSL scan of ${r.host} (${r.ip}:${r.port})`)
  lines.push(`Grade: ${r.grade}`)
  lines.push(`Trusted: ${r.chainTrusted ? 'yes' : 'no'}  ·  Hostname match: ${r.hostnameMatch ? 'yes' : 'no'}`)
  lines.push(`When: ${new Date().toUTCString()}`)
  lines.push('')
  if (r.certificate) {
    const c = r.certificate
    lines.push(';; Certificate')
    lines.push(`Subject:    ${c.subject}`)
    lines.push(`SAN:        ${c.subjectAltNames.join(', ')}`)
    lines.push(`Issuer:     ${c.issuer}`)
    lines.push(`Valid:      ${c.validFrom} → ${c.validTo} (${c.daysRemaining}d left)`)
    lines.push(`Key:        ${c.keyType} ${c.keyBits ?? '?'} bits`)
    lines.push(`Signature:  ${c.signatureAlgorithm}`)
    lines.push(`SHA-256:    ${c.sha256Fingerprint}`)
    lines.push('')
  }
  if (r.ocsp) {
    lines.push(';; Revocation (OCSP)')
    lines.push(`Stapled:    ${r.ocsp.stapled ? 'yes' : 'no'}`)
    lines.push(`Status:     ${r.ocsp.status}${r.ocsp.revokedAt ? ` (revoked ${r.ocsp.revokedAt})` : ''}`)
    lines.push('')
  }
  if (r.securityHeaders?.fetched) {
    const sh = r.securityHeaders
    lines.push(';; HTTP security headers')
    lines.push(`HSTS:       ${sh.hsts.present ? `max-age=${sh.hsts.maxAge ?? '?'}${sh.hsts.includeSubDomains ? '; includeSubDomains' : ''}${sh.hsts.preload ? '; preload' : ''}` : 'absent'}`)
    lines.push(`CSP:        ${sh.contentSecurityPolicy ? 'present' : 'absent'}`)
    lines.push(`X-Frame-Options:        ${sh.xFrameOptions ?? 'absent'}`)
    lines.push(`X-Content-Type-Options: ${sh.xContentTypeOptions ? 'nosniff' : 'absent'}`)
    lines.push('')
  }
  lines.push(';; Protocols')
  for (const p of r.protocols) lines.push(`${p.protocol.padEnd(9)} ${p.support}${p.note ? `  (${p.note})` : ''}`)
  lines.push('')
  lines.push(';; Cipher suites')
  for (const c of r.ciphers) lines.push(`${c.protocol.padEnd(9)} ${c.strength.padEnd(8)} ${c.bits ?? '?'}b  ${c.name}${c.forwardSecrecy ? ' [FS]' : ''}`)
  if (r.issues.length > 0) {
    lines.push('')
    lines.push(';; Issues')
    for (const i of r.issues) lines.push(`[${i.severity.toUpperCase()}] ${i.title} — ${i.detail}`)
  }
  return lines.join('\n').trimEnd() + '\n'
}

function toCsv(r: SslScanResult): string {
  const BOM = '﻿'
  const header = 'Section,Key,Value'
  const rows: string[] = []
  const row = (section: string, key: string, value: string): void => {
    rows.push([csvCell(section), csvCell(key), csvCell(value)].join(','))
  }
  row('summary', 'host', r.host)
  row('summary', 'endpoint', `${r.ip}:${r.port}`)
  row('summary', 'grade', r.grade)
  row('summary', 'trusted', r.chainTrusted ? 'yes' : 'no')
  row('summary', 'hostnameMatch', r.hostnameMatch ? 'yes' : 'no')
  if (r.certificate) {
    const c = r.certificate
    row('certificate', 'subject', c.subject)
    row('certificate', 'san', c.subjectAltNames.join(' '))
    row('certificate', 'issuer', c.issuer)
    row('certificate', 'validFrom', c.validFrom)
    row('certificate', 'validTo', c.validTo)
    row('certificate', 'key', `${c.keyType} ${c.keyBits ?? '?'}`)
    row('certificate', 'signature', c.signatureAlgorithm)
    row('certificate', 'sha256', c.sha256Fingerprint)
  }
  if (r.ocsp) {
    row('ocsp', 'stapled', r.ocsp.stapled ? 'yes' : 'no')
    row('ocsp', 'status', r.ocsp.revokedAt ? `${r.ocsp.status} (${r.ocsp.revokedAt})` : r.ocsp.status)
  }
  if (r.securityHeaders?.fetched) {
    const sh = r.securityHeaders
    row('headers', 'hsts', sh.hsts.present ? `max-age=${sh.hsts.maxAge ?? '?'}${sh.hsts.includeSubDomains ? ' includeSubDomains' : ''}${sh.hsts.preload ? ' preload' : ''}` : 'absent')
    row('headers', 'csp', sh.contentSecurityPolicy ? 'present' : 'absent')
    row('headers', 'x-frame-options', sh.xFrameOptions ?? 'absent')
    row('headers', 'x-content-type-options', sh.xContentTypeOptions ? 'nosniff' : 'absent')
  }
  for (const p of r.protocols) row('protocol', p.protocol, p.support)
  for (const c of r.ciphers) row('cipher', `${c.protocol} ${c.name}`, `${c.strength} ${c.bits ?? '?'}b${c.forwardSecrecy ? ' FS' : ''}`)
  for (const i of r.issues) row('issue', i.severity, `${i.title}: ${i.detail}`)
  const meta = `# nmtr SSL scan of ${r.host} (${r.ip}:${r.port}) - grade ${r.grade} - ${new Date().toUTCString()}`
  return BOM + meta + '\n' + header + '\n' + rows.join('\n')
}

const GRADE_COLOR: Record<string, string> = {
  'A+': '#3fb950', A: '#3fb950', B: '#d29922', C: '#d29922', D: '#f0883e', E: '#f0883e', F: '#f85149', T: '#f85149', M: '#f85149'
}

function cipherColor(c: TlsCipher): string {
  return c.strength === 'insecure' ? '#f85149' : c.strength === 'weak' ? '#d29922' : '#3fb950'
}

function toHtml(r: SslScanResult): string {
  const c = r.certificate
  const certRows = c
    ? `
    <tr><td>Subject</td><td class="mono">${esc(c.subject)}</td></tr>
    <tr><td>Alt names</td><td class="mono">${esc(c.subjectAltNames.join(', '))}</td></tr>
    <tr><td>Issuer</td><td class="mono">${esc(c.issuer)}</td></tr>
    <tr><td>Valid</td><td class="mono">${esc(c.validFrom)} → ${esc(c.validTo)} (${c.daysRemaining}d left)</td></tr>
    <tr><td>Key</td><td class="mono">${esc(c.keyType)} ${c.keyBits ?? '?'} bits</td></tr>
    <tr><td>Signature</td><td class="mono">${esc(c.signatureAlgorithm)}</td></tr>
    <tr><td>SHA-256</td><td class="mono">${esc(c.sha256Fingerprint)}</td></tr>`
    : '<tr><td colspan="2">No certificate presented</td></tr>'

  const protoRows = r.protocols
    .map((p) => `<tr><td class="mono">${p.protocol}</td><td class="${p.support}">${p.support}</td><td class="note">${esc(p.note ?? '')}</td></tr>`)
    .join('')

  const cipherRows = r.ciphers
    .map((c) => `<tr><td class="mono">${c.protocol}</td><td class="mono">${esc(c.name)}</td><td>${c.bits ?? '?'}</td><td>${c.forwardSecrecy ? 'yes' : 'no'}</td><td style="color:${cipherColor(c)}">${c.strength}</td></tr>`)
    .join('')

  const issueRows = r.issues
    .map((i) => `<tr><td class="sev sev-${i.severity}">${i.severity}</td><td>${esc(i.title)}</td><td class="note">${esc(i.detail)}</td></tr>`)
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>nmtr SSL – ${esc(r.host)} – ${new Date().toUTCString()}</title>
<style>
  body{font-family:Consolas,monospace;background:#0d1117;color:#e6edf3;padding:20px;font-size:12px}
  h1{font-size:14px;color:#7d8590;font-weight:600;display:flex;align-items:center;gap:12px}
  .grade{font-size:22px;font-weight:800;padding:2px 12px;border-radius:6px;color:#0d1117;background:${GRADE_COLOR[r.grade] ?? '#7d8590'}}
  section{margin:18px 0}
  h2{font-size:12px;color:#58a6ff;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #30363d;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;margin-top:6px}
  th{background:#161b22;color:#7d8590;padding:5px 10px;text-align:left;border-bottom:1px solid #30363d;font-size:10px;text-transform:uppercase}
  td{padding:4px 10px;border-bottom:1px solid #21262d;vertical-align:top}
  .mono{font-family:Consolas,monospace}
  .enabled{color:#3fb950}.disabled{color:#7d8590}.untested{color:#d29922}
  .note{color:#7d8590}
  .sev{text-transform:uppercase;font-weight:700}
  .sev-critical{color:#f85149}.sev-high{color:#f0883e}.sev-medium{color:#d29922}.sev-low{color:#58a6ff}.sev-info{color:#7d8590}
</style>
</head>
<body>
<h1><span class="grade">${esc(r.grade)}</span> nmtr SSL scan of ${esc(r.host)} (${esc(r.ip)}:${r.port}) &nbsp;·&nbsp; ${new Date().toUTCString()}</h1>
<section><h2>Trust</h2><table><tr><td>Chain trusted</td><td>${r.chainTrusted ? 'yes' : 'no'}</td></tr><tr><td>Hostname match</td><td>${r.hostnameMatch ? 'yes' : 'no'}</td></tr>${
    r.ocsp ? `<tr><td>OCSP (revocation)</td><td>${esc(r.ocsp.status)}${r.ocsp.revokedAt ? ` — revoked ${esc(r.ocsp.revokedAt)}` : ''}${r.ocsp.stapled ? '' : ' (not stapled)'}</td></tr>` : ''
  }</table></section>
${r.securityHeaders?.fetched ? `<section><h2>HTTP security headers</h2><table>
    <tr><td>HSTS</td><td class="mono">${r.securityHeaders.hsts.present ? esc(r.securityHeaders.hsts.raw ?? '') : '<span class="note">absent</span>'}</td></tr>
    <tr><td>Content-Security-Policy</td><td>${r.securityHeaders.contentSecurityPolicy ? 'present' : '<span class="note">absent</span>'}</td></tr>
    <tr><td>X-Frame-Options</td><td class="mono">${esc(r.securityHeaders.xFrameOptions ?? '') || '<span class="note">absent</span>'}</td></tr>
    <tr><td>X-Content-Type-Options</td><td>${r.securityHeaders.xContentTypeOptions ? 'nosniff' : '<span class="note">absent</span>'}</td></tr>
  </table></section>` : ''}
<section><h2>Certificate</h2><table>${certRows}</table></section>
<section><h2>Protocols</h2><table><thead><tr><th>Protocol</th><th>Support</th><th>Note</th></tr></thead><tbody>${protoRows}</tbody></table></section>
<section><h2>Cipher suites</h2><table><thead><tr><th>Protocol</th><th>Cipher</th><th>Bits</th><th>FS</th><th>Strength</th></tr></thead><tbody>${cipherRows || '<tr><td colspan="5">None detected</td></tr>'}</tbody></table></section>
${r.issues.length > 0 ? `<section><h2>Issues</h2><table><thead><tr><th>Severity</th><th>Issue</th><th>Detail</th></tr></thead><tbody>${issueRows}</tbody></table></section>` : ''}
</body>
</html>`
}
