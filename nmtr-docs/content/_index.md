---
title: "NMTR Documentation"
type: docs
---

# NMTR — Network Diagnostic Tool

NMTR is a modern Windows desktop application for continuous network path analysis. It combines parallel ICMP probing, real-time statistics, geolocation, and session recording into a single live dashboard — a full rewrite of WinMTR built on Electron.

## Quick Start

- [Requirements]({{< relref "/getting-started/requirements" >}}) — Windows 10/11 x64, administrator privileges
- [Installation]({{< relref "/getting-started/installation" >}}) — Installer, portable exe, or build from source
- [Your First Trace]({{< relref "/getting-started/first-trace" >}}) — Enter a target and read the hop table

## Key Features

- **Parallel ICMP engine** — calls `IcmpSendEcho` directly via `koffi` FFI, no external tools needed for probing
- **Per-hop stats** — Loss%, Last / Avg / Best / Worst RTT, Jitter, 60-point sparkline
- **Bottleneck highlight** — automatically marks the hop with the largest RTT increase
- **Route change detection** — detects mid-session IP changes per hop, logs all events
- **Geo world map** — fully offline SVG map with markers for every geo-located hop
- **Network path graph** — interactive node graph of the hop topology
- **Latency detail** — click any hop for a full RTT/loss chart with live updates
- **Session recording / playback** — save traces to `.nmtr` files and replay at adjustable speed
- **Export** — Text (WinMTR-compatible), CSV, HTML
- **Multi-tab traces** — run parallel traces to multiple targets simultaneously

## Manual Sections

| Section | Description |
|---|---|
| [Getting Started]({{< relref "/getting-started" >}}) | Install and run your first trace |
| [Interface]({{< relref "/interface" >}}) | Window layout, navigation, sidebar, status bar |
| [Tracing]({{< relref "/tracing" >}}) | Hop table, charts, bottleneck, route detection |
| [Visualizations]({{< relref "/visualizations" >}}) | Geo world map and network path graph |
| [Recording & Playback]({{< relref "/recording" >}}) | Save and replay sessions |
| [Export & Lookup]({{< relref "/export" >}}) | Text, CSV, HTML export and WHOIS |
| [Configuration]({{< relref "/configuration" >}}) | Settings and keyboard shortcuts |
| [Reference]({{< relref "/reference" >}}) | File format, internals, development guide |
