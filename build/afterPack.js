'use strict'

const fs = require('fs')
const path = require('path')

const KEEP_LOCALES = new Set(['en-US.pak'])

// Runtime DLLs Electron ships but this app never loads — dropping them
// shrinks the installer without affecting functionality.
//   dxcompiler.dll — WebGPU HLSL→DXIL shader compiler. App uses SVG charts,
//                    no <canvas>/WebGPU; Electron only loads it on first
//                    navigator.gpu access, which never happens.
const REMOVE_DLLS = ['dxcompiler.dll']

function removeIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return 0
  const size = fs.statSync(filePath).size
  fs.rmSync(filePath, { force: true })
  return size
}

exports.default = async function afterPack(context) {
  const { appOutDir } = context

  // Strip unused locale .pak files
  const localesDir = path.join(appOutDir, 'locales')
  if (fs.existsSync(localesDir)) {
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

  // Strip unused Electron runtime DLLs
  let dllBytes = 0
  const dllsRemoved = []
  for (const dll of REMOVE_DLLS) {
    const bytes = removeIfPresent(path.join(appOutDir, dll))
    if (bytes > 0) {
      dllBytes += bytes
      dllsRemoved.push(dll)
    }
  }
  if (dllsRemoved.length > 0) {
    console.log(
      `  • afterPack: removed ${dllsRemoved.length} unused DLL(s) [${dllsRemoved.join(', ')}] (${(dllBytes / 1024 / 1024).toFixed(1)} MB)`
    )
  }
}
