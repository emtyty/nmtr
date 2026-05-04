'use strict'

const fs = require('fs')
const path = require('path')

const KEEP_LOCALES = new Set(['en-US.pak'])

exports.default = async function afterPack(context) {
  const { appOutDir } = context
  const localesDir = path.join(appOutDir, 'locales')
  if (!fs.existsSync(localesDir)) return

  let removed = 0
  let removedBytes = 0
  for (const entry of fs.readdirSync(localesDir)) {
    if (KEEP_LOCALES.has(entry)) continue
    const full = path.join(localesDir, entry)
    const stat = fs.statSync(full)
    fs.rmSync(full, { force: true, recursive: true })
    removed++
    removedBytes += stat.size
  }
  console.log(
    `  • afterPack: removed ${removed} unused locale files (${(removedBytes / 1024 / 1024).toFixed(1)} MB)`
  )
}
