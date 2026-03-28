---
title: "History View"
weight: 3
---

# History View

The History view lists every trace session that has been stopped. It is accessible via the clock icon in the icon navigation bar.

## Table Columns

| Column | Description |
|---|---|
| **Target** | Hostname or IP that was traced |
| **Protocol** | ICMP, UDP, or TCP |
| **Started** | Date and time the session began |
| **Duration** | Total elapsed time from start to stop |
| **Hops** | Number of hops that replied with an IP address |
| **Avg Loss** | Mean packet loss across all hops (%) |
| **Avg RTT** | Average RTT of the final (destination) hop |
| **Engine** | `native` or `pingus` — which probe engine was used |

## Live Updates

The history list updates in real time. When a trace session stops (in the Traces view), its summary entry appears in the History view immediately — no manual refresh needed.

## Persistence

History entries are stored in `nmtr-history.json` via `electron-store` in the application data directory. They persist across restarts. There is currently no built-in limit on the number of entries.

> The history file is located at:
> `%APPDATA%\nmtr\nmtr-history.json`
