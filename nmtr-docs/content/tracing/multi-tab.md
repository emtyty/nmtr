---
title: "Multi-Tab Traces"
weight: 7
---

# Multi-Tab Traces

NMTR supports running multiple trace sessions simultaneously — each to a different target, with independent stats, probe engines, and recording state.

## Opening a New Session

Click **+ New Trace** in the sidebar. A new session card appears in the sidebar list with an empty target field. Enter a target and press Start — this session runs completely independently of any other open sessions.

## Switching Sessions

Click any session card in the sidebar to make it the active session. The main content area (hop table, charts, map) updates to reflect the selected session. Background sessions continue probing even while you are viewing a different session.

## Independent State

Each session has its own:

- Target, protocol, and probe configuration
- Hop table and statistics
- RTT history (for the heartbeat chart)
- Route event log
- Recording state
- Tracert discovery result

## Session Lifecycle

Sessions persist until you explicitly close them. Stopped sessions remain in the sidebar and can be re-examined. The sidebar tray menu also lists active (running) sessions for quick access when the window is hidden.

## System Tray

When NMTR is minimised to the system tray, the tray context menu shows a live count of running sessions. Clicking the tray icon restores the window.
