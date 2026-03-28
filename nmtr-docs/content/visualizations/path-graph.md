---
title: "Network Path Graph"
weight: 2
---

# Network Path Graph

The **Path** tab renders the network path as an interactive node-edge graph using `@xyflow/react`.

## Layout

Each hop is a node. Edges connect consecutive hops in TTL order. The graph flows left-to-right:

```
[Your Machine] → [Hop 1] → [Hop 2] → ... → [Target]
```

`* * *` hops (no reply) are shown as greyed-out placeholder nodes so the overall path shape is preserved.

## Node Information

Each node displays:

- Hop number
- IP address
- Hostname (if resolved)
- Avg RTT
- Loss%

Node border colour reflects loss severity:
- **Green** — 0% loss
- **Amber** — 1–10% loss
- **Red** — > 10% loss

## Interaction

| Action | Result |
|---|---|
| Drag canvas | Pan the graph |
| Scroll wheel | Zoom in / out |
| Right-click node | Context menu (View WHOIS, Copy IP) |
| Fit view button | Reset pan/zoom to show all nodes |

## Route Changes

Hops that have experienced a route change (see [Route Change Detection]({{< relref "/tracing/route-change-detection" >}})) display the `▲` indicator on their node.
