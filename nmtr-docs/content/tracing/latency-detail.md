---
title: "Latency Detail"
weight: 4
---

# Latency Detail

Clicking anywhere on a hop row opens the Latency Detail dialog — a full-screen-width panel with a dedicated chart and stat breakdown for that single hop.

## Opening the Dialog

Left-click any row in the hop table. The dialog opens immediately with a snapshot of the current data for that hop. It can be closed with the **×** button or by pressing `Escape`.

## Chart

The chart displays the hop's **60-point rolling sparkline** as a line chart, overlaid with packet-loss bars:

- **RTT line** — coloured green / amber / red based on the hop's average RTT (same thresholds as the heartbeat chart)
- **Loss bars** — semi-transparent red bars appear at the x-position of each lost probe
- **Avg reference line** — a dashed blue horizontal line marks the running average

Hovering over any point shows the exact RTT value in a tooltip.

## Stat Panel

Below the chart, six stats are displayed in a grid:

| Stat | Description |
|---|---|
| Last | RTT of the most recent probe |
| Avg | Running mean RTT |
| Best | Lowest RTT recorded |
| Worst | Highest RTT recorded |
| Jitter | Mean deviation (RFC 3550) |
| Loss | Packet loss percentage |

## Live Updates

The dialog refreshes every **1 second** while open. It reads directly from the live Zustand store so stats continue to update even while the dialog is visible. The refresh interval is decoupled from the probe interval to avoid rerendering too frequently.

## Hop Identity

The dialog header shows the hop's hostname, IP, ASN, and city/country (if enrichment data is available), making it easy to identify which router you are inspecting.
