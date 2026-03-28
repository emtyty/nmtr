---
title: "Development"
weight: 3
---

# Development

## Prerequisites

- Node.js 18+, npm 9+
- Python 3.x and Visual Studio Build Tools (C++ workload) — required by `node-gyp` to compile `koffi`
- Run your terminal **as Administrator** so the ICMP engine can open sockets during development

## Setup

```bash
git clone https://github.com/your-org/nmtr.git
cd nmtr

# Install all dependencies
npm install --legacy-peer-deps

# Rebuild koffi against the bundled Electron runtime
npm run rebuild
```

`--legacy-peer-deps` is required because some transitive dependencies have not yet declared React 18 peer compatibility.

## Scripts

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Starts electron-vite with HMR for the renderer and restarts the main process on changes |
| Build | `npm run build` | Compiles renderer + main to `out/` |
| Package | `npm run dist:win` | Runs build then electron-builder to produce NSIS installer + portable exe in `dist-release/` |
| Rebuild native | `npm run rebuild` | Runs `electron-rebuild` to compile native modules against the current Electron ABI |

## Project Structure

```
src/
├── shared/              # Shared TypeScript types (HopStats, TraceSession, …)
├── main/                # Electron main process
│   ├── ipc/             # IPC channel constants + request/push handlers
│   ├── prober/          # ProberSession, StatsAggregator, NativeEngine, PingusEngine
│   ├── enrichment/      # GeoIPLookup (ip-api.com, LRU-cached) + WhoisFetcher
│   ├── recording/       # SessionRecorder + SessionPlayer (.nmtr NDJSON)
│   ├── export/          # ExportFormatter (text / CSV / HTML)
│   ├── store/           # electron-store wrappers (AppSettings, HistoryStore)
│   ├── tray/            # TrayManager
│   ├── updater/         # AutoUpdater (electron-updater)
│   └── utils/           # logoIcon pixel renderer
├── preload/             # contextBridge → window.nmtrAPI
└── renderer/            # React + Tailwind UI
    ├── store/           # Zustand stores (trace, UI, settings, recording, history)
    ├── components/
    │   ├── controls/    # TraceControls, ExportMenu
    │   ├── dialogs/     # SettingsDialog, WhoisDialog, LatencyDetailDialog, TracertResultModal
    │   ├── layout/      # TitleBar, IconNav, Sidebar, StatusBar
    │   ├── network-map/ # NetworkGeoMap (react-simple-maps), NetworkPathMap (@xyflow/react)
    │   ├── playback/    # PlaybackBar
    │   ├── trace/       # HopTable, HopRow, SessionRttChart, RouteEventsPanel, Sparkline
    │   ├── update/      # UpdateBanner
    │   └── views/       # HistoryView, TraceView
    ├── lib/             # scrollGate (hop-table scroll locking)
    └── hooks/           # useTraceSession, useKeyboardShortcuts, useUpdater
```

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 35 |
| Renderer | React 18 · TypeScript · Tailwind CSS v3 |
| Bundler | electron-vite + Vite 6 |
| State | Zustand |
| UI primitives | Radix UI |
| Charts | recharts |
| ICMP engine | koffi FFI → `Iphlpapi.dll` `IcmpSendEcho` |
| Geo enrichment | ip-api.com (LRU-cached via `lru-cache`) |
| World map | react-simple-maps + world-atlas (offline TopoJSON) |
| Path graph | @xyflow/react |
| Persistence | electron-store |
| Auto-update | electron-updater |
| Packaging | electron-builder (NSIS + portable) |

## IPC Architecture

Communication between the renderer and main process uses Electron's `ipcRenderer` / `ipcMain` over a `contextBridge`-exposed `window.nmtrAPI`. All channel names are defined as constants in `src/main/ipc/channels.ts`.

**Request/response channels** (renderer → main → response):
- `trace:start`, `trace:stop`, `trace:reset`
- `export:generate`
- `whois:lookup`
- `recording:start`, `recording:stop`
- `playback:open`, `playback:start`, `playback:seek`, `playback:stop`
- `settings:get`, `settings:set`
- `history:getAll`
- `updater:check`

**Push channels** (main → renderer):
- `hops:batch`, `hop:enriched`, `hop:routeChanged`
- `session:status`
- `tracert:result`
- `history:entryAdded`
- `playback:frame`
- `updater:status`
