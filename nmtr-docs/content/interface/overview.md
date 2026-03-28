---
title: "Overview"
weight: 1
---

# Interface Overview

NMTR uses a frameless window with a custom title bar. The layout is divided into four main regions:

```
┌─────────────────────────────────────────────────────┐
│  Title Bar          [minimize] [maximize] [close]   │
├──┬──────────────────────────────────────────────────┤
│  │  Update Banner (appears when update available)   │
│N │──────────────────────────────────────────────────│
│a │  Sidebar          Main Content Area              │
│v │  (session list)   (TraceView or HistoryView)     │
│  │                                                  │
├──┴──────────────────────────────────────────────────┤
│  Status Bar                                         │
└─────────────────────────────────────────────────────┘
```

## Title Bar

The custom title bar displays the application name and provides window controls (minimize, maximize/restore, close). Closing the window hides it to the system tray if **Minimize to Tray on Close** is enabled in Settings.

## Icon Navigation Bar (Nav)

A narrow vertical icon strip on the far left switches between the two top-level views:

| Icon | View |
|---|---|
| Network icon | **Traces** — active sessions and the hop table |
| Clock/history icon | **History** — completed session log |

## Sidebar

Visible only in the Traces view. Lists all open trace sessions. Click a session to make it active, or use the **+ New Trace** button to open a parallel session. See [Traces View]({{< relref "/interface/traces-view" >}}) for details.

## Update Banner

Appears below the title bar when a new release is detected. Click the banner to download and install the update. The banner can be dismissed.

## Status Bar

A thin bar at the very bottom showing live session stats:

- Protocol and target
- Elapsed time
- Total probes sent
- Engine mode (`native` ICMP FFI or `pingus` fallback)
- Session status (Running / Stopped / Playback)
