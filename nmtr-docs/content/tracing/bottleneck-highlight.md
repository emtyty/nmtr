---
title: "Bottleneck Highlight"
weight: 5
---

# Bottleneck Highlight

NMTR automatically identifies the hop that is most likely responsible for elevated latency on the path and highlights it visually.

## Detection Logic

After each update cycle, NMTR scans the hop table in TTL order and computes the RTT delta between each hop and its nearest predecessor:

```
delta = hop[N].avg − hop[N-1].avg
```

Hops with `avg = null` (`* * *`) are skipped. The hop with the **largest positive delta** is marked as the bottleneck, provided the delta exceeds the **10 ms minimum threshold**. If no hop exceeds 10 ms, no bottleneck is highlighted.

## Visual Indicators

The bottleneck hop receives two visual markers:

- **`▶` arrow** in the hop number column
- **Yellow row tint** on the entire row

These update live as RTT averages evolve during the session.

## Interpretation

A highlighted bottleneck indicates where the largest single RTT jump occurs. This is often:

- A congested link between two routers
- A transatlantic or intercontinental segment
- A peering point between two ISPs

> A bottleneck hop does not necessarily mean there is a problem at that router. A 30 ms jump on a cross-continent fibre link is expected. Compare against the hop's own Loss% and Jitter for a fuller picture.
