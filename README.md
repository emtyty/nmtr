# nmtr — Network Diagnostic Tool

A modern rewrite of WinMTR as an Electron desktop application. Combines traceroute and continuous ping into a live dashboard with per-hop statistics, AS/ISP geolocation enrichment, latency sparklines, and session recording/playback.

![nmtr screenshot](nmtr-ui-mockup.png)

## Features

- **Real-time ICMP tracing** — continuous per-hop probing with live stats table
- **Protocol support** — ICMP (default), UDP, TCP with configurable port
- **Per-hop stats** — Loss%, Sent, Recv, Last / Avg / Best / Worst (ms), Jitter
- **Sparklines** — 60-point rolling latency trend per hop; click to open detail chart
- **AS / ISP enrichment** — autonomous system and ISP name per hop via ip-api.com
- **Geolocation** — country and city per hop
- **Reverse DNS** — hostname resolution with LRU cache
- **IP WHOIS** — right-click any hop → View WHOIS
- **Multi-tab traces** — run parallel traces to multiple targets simultaneously
- **Session recording / playback** — record to `.nmtr` file, replay with scrubber
- **Export** — Text (WinMTR-compatible), CSV, HTML formats
- **Dark theme** — dark-first UI with system tray support
- **Admin mode** — full ICMP/UDP/TCP probing via Pingus (requires elevation)
- **No-admin fallback** — ICMP-only mode via `tracert.exe` + `ping.exe`

## Requirements

- **Windows 10 / 11** (v1 — Windows only)
- **Node.js 18+**
- **npm 9+**
- Administrator privileges recommended for full protocol support

## Getting Started

### Install dependencies

```bash
npm install
```

If `pingus` (native addon) fails to build, rebuild it against the bundled Electron version:

```bash
npm run rebuild
```

### Run in development

```bash
npm run dev
```

Opens the app with hot-module reload. For full ICMP/UDP/TCP probing, run the terminal **as Administrator**.

### Build for production

```bash
# Build renderer + main bundles only
npm run build

# Build + package as Windows installer (NSIS) + portable EXE
npm run dist:win

# Cross-platform (builds for current OS)
npm run dist
```

Output is written to `dist/`.

## Project Structure

```
src/
├── shared/          # Shared TypeScript types (HopStats, TraceSession, …)
├── main/            # Electron main process
│   ├── ipc/         # IPC channel names + handlers
│   ├── prober/      # ProberSession, StatsAggregator, PingusEngine, NativeEngine
│   ├── enrichment/  # GeoIP (ip-api.com) + WHOIS lookup
│   ├── recording/   # Session recorder + player
│   ├── export/      # Text / CSV / HTML formatters
│   ├── store/       # Persisted app settings (electron-store)
│   └── tray/        # System tray manager
├── preload/         # contextBridge → window.nmtrAPI
└── renderer/        # React + Tailwind UI
    ├── store/        # Zustand stores (trace sessions, settings, recording)
    ├── components/   # Layout, trace table, controls, dialogs
    └── hooks/        # useTraceSession (IPC → store bridge)
```

## How It Works

1. **Start** — enter a hostname or IP, choose protocol, click Start
2. **Engine selection** — if running as Administrator, uses `PingusEngine` (raw ICMP/UDP/TCP with TTL control); otherwise falls back to `NativeEngine` (wraps `tracert.exe`)
3. **Probing loop** — sends one probe per TTL per interval, aggregates RTT samples into per-hop stats
4. **Enrichment** — each new hop IP is queued for AS/ISP + geo lookup via ip-api.com (rate-limited to 40 req/min)
5. **IPC batching** — all hop stats are sent in a single `hops:batch` event per probe round (300 ms throttle in renderer)

## Performance Notes

- 3 concurrent traces at 500 ms interval typically use < 5% CPU
- UI updates are batched (300 ms) and wrapped in React `startTransition` to keep the interface responsive
- `React.memo` on `HopTable` and `HopRow` prevents re-renders for unchanged rows

## License

MIT
