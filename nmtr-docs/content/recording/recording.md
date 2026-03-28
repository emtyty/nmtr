---
title: "Recording a Session"
weight: 1
---

# Recording a Session

## Starting a Recording

1. Start a trace session normally.
2. In the controls bar, click the **Record** button (or use the recording menu).
3. A system file-save dialog opens — choose a location and filename. The file extension `.nmtr` is added automatically.
4. Recording begins immediately. A red indicator in the controls bar shows that recording is active.

## What Gets Recorded

Every probe round that produces updated hop stats is written to the file as a `frame` line. Route change events are also captured as `routechange` lines. The file header (`meta` line) stores the session configuration.

See [.nmtr File Format]({{< relref "/reference/nmtr-file-format" >}}) for the complete specification.

## Stopping a Recording

Click the **Stop Recording** button. NMTR finalises the file and closes the write stream. The trace session itself continues running — stopping a recording does not stop the trace.

## File Size

Each frame is a single JSON line containing the full hop array. At 30 hops and 500 ms intervals, a 10-minute session produces roughly **500–800 KB**. Longer sessions or more hops will scale proportionally.

## Notes

- A recording can be started and stopped multiple times during a session — each start opens a new file.
- Recordings capture the exact state of every hop at each probe round, so replays are pixel-accurate reproductions of the original session.
