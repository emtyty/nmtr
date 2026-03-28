---
title: "How It Works"
weight: 2
---

# How It Works

## 1. Session Start — Route Discovery

When a trace session starts, NMTR spawns a `tracert` subprocess:

```
tracert -d -h <maxHops> -w 1000 <target>
```

The `-d` flag disables DNS resolution (NMTR handles that separately), and `-w 1000` sets a 1-second timeout per hop. The raw stdout/stderr is captured and stored so it can be displayed in the 📡 TracertResultModal.

As `tracert` output arrives, each `<TTL> → <IP>` line is parsed to build an initial hop map. These discovered hops seed the prober's starting TTL set.

## 2. Parallel ICMP Probing

For each TTL from 1 to `maxHops`, a dedicated probe loop runs independently. Each loop:

1. Calls `IcmpSendEcho` asynchronously via the `koffi` FFI binding to `Iphlpapi.dll`
2. Sets the TTL via an `IP_OPTION_INFORMATION` buffer (matching WinMTR's `TraceThread` approach)
3. Passes a `IPFLAG_DONT_FRAGMENT` flag and a 32-byte request payload (spaces, like WinMTR)
4. Receives the reply into an 8 KB buffer and reads the status and RTT from fixed offsets in `ICMP_ECHO_REPLY`

Because `koffi` dispatches each call to its own thread-pool thread, all TTL probes can be in-flight simultaneously with no concurrency cap — equivalent to WinMTR's one-thread-per-TTL design.

### Reply Status Codes

| Code | Value | Meaning |
|---|---|---|
| `IP_SUCCESS` | 0 | Destination reached — final hop |
| `IP_TTL_EXPIRED_TRANSIT` | 11013 | Intermediate hop — TTL-exceeded reply |
| `IP_REQ_TIMED_OUT` | 11010 | No reply within timeout |

RTT is read directly from the kernel-measured `RoundTripTime` field in `ICMP_ECHO_REPLY`, not from wall-clock timestamps.

### Fallback Engine

If `koffi` cannot load `Iphlpapi.dll` (e.g., in a restricted environment), NMTR falls back to spawning `ping.exe` with `-i <ttl>` for each TTL. RTT in this mode is measured by wall clock and is slightly less accurate.

## 3. Stats Aggregation

Each successful probe result is fed into a `StatsAggregator` instance (one per TTL):

- **Loss%** — `(sent − recv) / sent × 100`
- **Avg** — running arithmetic mean
- **Best / Worst** — rolling min/max
- **Jitter** — mean deviation: `mean(|RTT − avg|)` per RFC 3550
- **Sparkline** — 60-element ring buffer, oldest entry evicted on overflow

## 4. Enrichment Pipeline

Each new hop IP is pushed to an enrichment queue:

1. **Reverse DNS** — `dns.lookup` PTR request, result stored as `hostname`
2. **GeoIP** — HTTP request to `ip-api.com` (fields: `as,isp,country,countryCode,city,lat,lon`), rate-limited via `p-queue`, LRU-cached per IP
3. Private/RFC-1918 ranges are skipped for GeoIP

Results are sent to the renderer via `hop:enriched` IPC events as they arrive asynchronously.

## 5. IPC Batching

After each probe round, the main process sends a single `hops:batch` event to the renderer containing the full updated hop array. The renderer applies a **300 ms throttle** inside `startTransition` to avoid blocking the React event loop during rapid updates.

Other push events:
- `hop:enriched` — enrichment data arrived for a hop
- `hop:routeChanged` — route change detected
- `session:status` — elapsed time / total sent tick
- `history:entryAdded` — session stopped and saved to history
- `tracert:result` — tracert discovery completed

## 6. History Persistence

When a session stops, a `HistoryEntry` summary is computed and written to `nmtr-history.json` via `electron-store`. The entry is simultaneously pushed to the renderer via `history:entryAdded` so the History view updates without a reload.
