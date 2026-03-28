---
title: "RTT Heartbeat Chart"
weight: 3
---

# RTT Heartbeat Chart

The RTT heartbeat chart sits above the hop table and gives a continuous time-series view of the final-hop (destination) round-trip time.

## What It Tracks

The chart plots the RTT of the **last responding hop** — the destination or the furthest hop that replied — for each probe round. It is a live indicator of end-to-end latency to your target.

## Sample Window

The chart retains up to **300 samples**. At the default 500 ms interval this represents 2.5 minutes of history. Older samples scroll off the left edge as new ones arrive.

## Color Coding

The line color changes based on the current average RTT of the final hop:

| RTT range | Color |
|---|---|
| < 50 ms | Green |
| 50 – 150 ms | Amber |
| > 150 ms | Red |

## Visibility

The chart is only shown when the active session has at least one data point. It disappears in the empty state (no active session) and is not shown in the Path or Map tabs.
