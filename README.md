# {NMTR} — Network Diagnostic Tool

A modern rewrite of WinMTR as an Electron desktop application for Windows. Combines continuous traceroute and real-time ping into a live dashboard with per-hop statistics, geolocation, session recording, and trace history.

![nmtr screenshot](nmtr-ui-mockup.png)

## Features

- **Parallel ICMP engine** — calls `IcmpSendEcho` from `Iphlpapi.dll` directly via `koffi` FFI (no subprocess spawning), all TTLs probed in parallel with no concurrency cap, kernel-measured RTT
- **Per-hop statistics** — Loss%, Sent, Recv, Last / Avg / Best / Worst (ms), Jitter, 60-point rolling sparkline
- **RTT heartbeat chart** — live chart above the hop table tracking final-hop RTT over the session (up to 300 samples), color-coded by latency
- **Bottleneck highlight** — automatically marks the hop with the largest RTT increase (≥10 ms delta) with `▶` and a yellow row tint
- **Route change detection** — detects mid-session IP changes per hop, marks with `▲`, logs events in the Route Events panel
- **Geo world map** — fully offline SVG map (bundled TopoJSON, zero network requests) with markers for every geo-located hop and hover tooltips
- **Network path graph** — interactive node graph of the hop topology
- **Trace history** — completed sessions are automatically saved and viewable in the History tab; updates live when a trace stops
- **Session recording / playback** — save traces to `.nmtr` files and replay at adjustable speed with a scrubber
- **Export** — Text (WinMTR-compatible), CSV, HTML; text copies directly to clipboard
- **WHOIS lookup** — right-click any hop → View WHOIS
- **Multi-tab traces** — run parallel traces to multiple targets simultaneously
- **System tray** — minimize to tray, context menu shows active sessions
- **Auto-updater** — GitHub Releases integration via `electron-updater`
- **Keyboard shortcuts** — `Ctrl+Enter` start/stop, `Ctrl+R` reset, `Ctrl+E` export, `Ctrl+,` settings

## Requirements

- **Windows 10 / 11 x64**
- **Administrator privileges** — required for raw ICMP probing (installer sets `requireAdministrator`)
- Node.js 18+ and npm 9+ for development

## Download

Grab the latest installer or portable exe from the [Releases](../../releases) page.

## Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Rebuild native modules (koffi) against the bundled Electron version
npm run rebuild

# Start dev server with hot reload
npm run dev

# Production build (renderer + main bundles)
npm run build

# Build Windows installer (NSIS) + portable exe
npm run dist:win
```

> Run the terminal **as Administrator** to enable full ICMP probing during development.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Start / stop the active trace |
| `Ctrl+R` | Reset active session stats |
| `Ctrl+E` | Export as text → copy to clipboard |
| `Ctrl+,` | Open Settings |

## Project Structure

```
src/
├── shared/              # Shared TypeScript types (HopStats, TraceSession, HistoryEntry, …)
├── main/                # Electron main process
│   ├── ipc/             # IPC channel constants + request handlers
│   ├── prober/          # ProberSession, StatsAggregator, NativeEngine (ICMP FFI), PingusEngine
│   ├── enrichment/      # GeoIP (ip-api.com, LRU-cached) + WHOIS fetcher
│   ├── recording/       # Session recorder + player (.nmtr NDJSON format)
│   ├── export/          # Text / CSV / HTML formatters
│   ├── store/           # electron-store wrappers (AppSettings, HistoryStore)
│   ├── tray/            # System tray manager
│   ├── updater/         # Auto-updater (electron-updater)
│   └── utils/           # Shared utilities (logo icon pixel renderer)
├── preload/             # contextBridge → window.nmtrAPI
└── renderer/            # React + Tailwind UI
    ├── store/           # Zustand stores (trace, UI, settings, recording, history)
    ├── components/
    │   ├── controls/    # TraceControls, ExportMenu
    │   ├── dialogs/     # Settings, WHOIS, latency detail, tracert modal
    │   ├── layout/      # TitleBar, IconNav, Sidebar, StatusBar
    │   ├── network-map/ # Geo map (react-simple-maps), path graph (@xyflow/react)
    │   ├── playback/    # Playback bar
    │   ├── trace/       # HopTable, SessionRttChart, RouteEventsPanel
    │   ├── update/      # Update banner
    │   └── views/       # HistoryView
    └── hooks/           # useTraceSession (IPC → store), useKeyboardShortcuts, useUpdater
```

## How It Works

1. **Session start** — `tracert` is spawned once to discover the initial hop list; result is stored and accessible via the 📡 button
2. **Parallel probing** — for each TTL 1…maxHops, a dedicated loop runs in parallel; each probe calls `IcmpSendEcho` on a thread-pool thread via `koffi` async with the TTL set in `IP_OPTION_INFORMATION`
3. **Reply parsing** — `IP_TTL_EXPIRED_TRANSIT` (11013) identifies intermediate hops; `IP_SUCCESS` (0) identifies the destination; RTT is read directly from `ICMP_ECHO_REPLY` (kernel-measured)
4. **Enrichment** — each new hop IP is queued for ASN/ISP/geo lookup via ip-api.com (rate-limited, LRU-cached); DNS reverse lookup runs concurrently
5. **Route change detection** — each round compares the replying IP to the stored IP; a change emits `hop:routeChanged`, re-triggers enrichment, and logs the event
6. **IPC batching** — all hop stats are sent in a single `hops:batch` event per probe round; the renderer applies a 300 ms throttle inside `startTransition` to stay responsive
7. **History** — when a trace stops, a summary entry is saved to `nmtr-history.json` via electron-store and pushed to the renderer immediately via `history:entryAdded`

## Tech Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 35 |
| Renderer | React 18 · TypeScript · Tailwind CSS v3 |
| Bundler | electron-vite + Vite 6 |
| State | Zustand |
| UI primitives | Radix UI |
| ICMP engine | koffi FFI → `Iphlpapi.dll` `IcmpSendEcho` |
| Geo enrichment | ip-api.com (LRU-cached) |
| World map | react-simple-maps + world-atlas (offline TopoJSON) |
| Path graph | @xyflow/react |
| Persistence | electron-store |
| Auto-update | electron-updater |
| Packaging | electron-builder (NSIS installer + portable) |

## License

MIT — see [LICENSE](LICENSE)
