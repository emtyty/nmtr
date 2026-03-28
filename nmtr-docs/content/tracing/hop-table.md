---
title: "Hop Table"
weight: 2
---

# Hop Table

The hop table is the primary data view. Each row represents one network hop between your machine and the target.

## Column Reference

| Column | Type | Description |
|---|---|---|
| **#** | Integer | TTL / hop index (1 = the first router past your machine) |
| **Host** | Text | Hostname (if resolved) and IP address. Shows `* * *` when no reply was received |
| **Loss%** | Float | `(sent − recv) / sent × 100`. Packet loss at this hop |
| **Sent** | Integer | Total probe packets sent to this TTL |
| **Recv** | Integer | Total replies received from this TTL |
| **Last** | ms | RTT of the most recent successful probe |
| **Avg** | ms | Running arithmetic mean of all successful RTTs |
| **Best** | ms | Lowest RTT ever recorded |
| **Worst** | ms | Highest RTT ever recorded |
| **Jitter** | ms | Mean deviation (RFC 3550): average of `|RTT − avg|` |
| **▪▪▪** | Sparkline | 60-point rolling ring buffer, newest sample at the right edge |

## Sparkline

The sparkline gives a visual overview of RTT stability over the last 60 probes. Missing bars (gaps) represent lost probes. A flat, consistent line indicates a stable hop; erratic height variation indicates jitter.

## `* * *` Hops

A row showing `* * *` means NMTR received no reply for that TTL within the timeout window. This is normal for:

- Routers configured to silently drop ICMP TTL-exceeded messages
- Firewalled intermediate hops

`* * *` hops count against Loss% for that TTL but do **not** mean traffic is dropped beyond that point — packets still pass through, the router just does not reply.

## Hop Enrichment

Each hop IP is looked up asynchronously:

- **Hostname** — reverse DNS (`PTR` record)
- **ASN / ISP** — via ip-api.com (rate-limited, LRU-cached)
- **City / Country** — from the same geo lookup
- **Lat / Lng** — used by the [Geo Map]({{< relref "/visualizations/geo-map" >}})

Enrichment data appears in the Host column tooltip and in the [Latency Detail]({{< relref "/tracing/latency-detail" >}}) dialog.

## Right-Click Context Menu

Right-clicking any hop row opens a context menu with:

- **View WHOIS** — opens the [WHOIS dialog]({{< relref "/export/whois" >}}) for this IP
- **Copy IP** — copies the raw IP to the clipboard
- **Copy Hostname** — copies the resolved hostname

## Clicking a Row

Left-clicking the latency area of a hop row opens the [Latency Detail]({{< relref "/tracing/latency-detail" >}}) dialog for that hop.
