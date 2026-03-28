---
title: "Route Change Detection"
weight: 6
---

# Route Change Detection

NMTR monitors the IP address that replies at each TTL. If a different IP replies compared to the one stored for that hop, NMTR treats it as a route change and records the event.

## How It Works

Every probe round, the replying IP at each TTL is compared to the stored IP for that hop:

1. If the IP is new (hop never seen before) — the hop is registered normally.
2. If the IP differs from the stored IP — a `RouteChangeEvent` is emitted, the hop's enrichment data is re-fetched for the new IP, and the event is appended to the session log.

## Visual Indicator

Hops that have experienced at least one IP change during the session display a **`▲` triangle** marker in the hop number column. The marker persists for the rest of the session even if the route stabilises.

## Route Events Panel

A collapsible panel below the hop table (visible in the **Table** tab) lists all route change events for the active session:

| Column | Description |
|---|---|
| Time | Seconds elapsed since session start when the change was detected |
| Hop | TTL index where the change occurred |
| Old IP | The IP that was previously responding |
| New IP | The IP that replaced it |

Events are shown in chronological order. The panel is hidden if the session has no route changes.

## Recorded Events

Route change events are included in `.nmtr` recording files so they can be replayed accurately. See [.nmtr File Format]({{< relref "/reference/nmtr-file-format" >}}).
