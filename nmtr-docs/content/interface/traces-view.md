---
title: "Traces View"
weight: 2
---

# Traces View

The Traces view is the main workspace. It is selected by default and is where you start, monitor, and control active trace sessions.

## Controls Bar

Runs across the top of the content area and contains:

- **Target field** — hostname or IP address to trace
- **Protocol selector** — ICMP / UDP / TCP
- **Interval** — probe frequency (500 ms to 5 s)
- **Packet size** — payload size in bytes (28–1472)
- **Max Hops** — maximum TTL to probe (1–30)
- **Start / Stop button** — toggles the active session (`Ctrl+Enter`)
- **Reset button** — clears stats without stopping (`Ctrl+R`)

### Tracert Button (📡)

Appears next to the Export menu once route discovery completes for the active session. Clicking it opens the **Tracert Result Modal** — a raw view of the `tracert` output used for initial hop discovery. A red dot on the button indicates that `tracert` encountered an error (hops may still have been partially discovered).

### Export Menu

Opens a dropdown to export the active session. See [Export Formats]({{< relref "/export/formats" >}}).

## Tab Bar

When a session is active, three view tabs appear below the controls bar:

| Tab | Content |
|---|---|
| **Table** | Hop table, RTT chart, Route Events panel |
| **Path** | Interactive network path graph |
| **Map** | Geo world map with hop markers |

## Sidebar

Lists all open trace sessions as cards. Each card shows:

- Target hostname / IP
- Current status badge (Running / Stopped)
- Elapsed time

Click a card to switch the active session. The **+ New Trace** button opens a fresh session alongside the existing ones — all sessions probe independently in the background.
