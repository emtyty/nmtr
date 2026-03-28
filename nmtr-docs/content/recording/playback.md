---
title: "Playback"
weight: 2
---

# Playback

## Opening a Recording

1. Click **Open Recording** in the controls bar or File menu.
2. Select a `.nmtr` file in the system file-open dialog.
3. NMTR creates a new playback session in the sidebar. The session is immediately paused at the first frame.

## Playback Bar

When a playback session is active, a dedicated bar appears above the status bar:

| Control | Description |
|---|---|
| **Play / Pause** | Start or pause frame playback |
| **Scrubber** | Drag to seek to any point in the recording |
| **Speed selector** | 0.25× · 0.5× · 1× · 2× · 4× · 8× |
| **Time display** | Current position / total duration |
| **Frame counter** | Current frame index / total frames |

## Seek Behaviour

Dragging the scrubber seeks to the nearest recorded frame at the chosen timestamp. All hop stats update immediately to reflect the state at that point in time. The hop table, RTT chart, and maps all reflect the sought frame.

## Speed Control

The speed multiplier compresses or expands the inter-frame delay:

| Speed | Real-time equivalent |
|---|---|
| 0.25× | 4× slower than real time |
| 1× | Real time |
| 4× | 4 minutes of recording plays in 1 minute |
| 8× | 8× faster than real time |

## Playback vs Live Sessions

Playback sessions are read-only — the probe engine is not active. All features that require live data (recording, reset) are disabled. Export, WHOIS, and visualisation tabs are all fully functional during playback.

A playback session is identifiable by the **Playback** badge in the status bar.
