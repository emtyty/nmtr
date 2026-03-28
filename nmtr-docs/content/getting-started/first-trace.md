---
title: "Your First Trace"
weight: 3
---

# Your First Trace

## 1. Enter a Target

In the top controls bar, type a hostname or IP address into the target field.

```
8.8.8.8
google.com
192.168.1.1
```

IPv4 hostnames are resolved to an IP automatically before the first probe.

## 2. Choose a Protocol

The protocol selector defaults to **ICMP**. Leave it as-is for most use cases — ICMP gives the most accurate results with the lowest overhead.

See [Starting a Trace]({{< relref "/tracing/starting-a-trace" >}}) for details on UDP and TCP modes.

## 3. Start the Trace

Press **Start** or use `Ctrl+Enter`. Two things happen immediately:

1. A `tracert` subprocess runs to discover the initial hop list and populate the table. The raw output is accessible via the **📡 Tracert** button.
2. The parallel ICMP probe engine starts firing one probe per TTL per interval, updating each hop row in real time.

## 4. Read the Hop Table

Each row represents one network hop on the path to your target:

| Column | Meaning |
|---|---|
| **#** | TTL / hop number (1 = first router) |
| **Host** | Hostname (if resolved) and IP address |
| **Loss%** | Percentage of probes that received no reply |
| **Sent / Recv** | Total probes sent and replies received |
| **Last** | RTT of the most recent successful probe |
| **Avg** | Running mean RTT |
| **Best / Worst** | Minimum and maximum RTT seen |
| **Jitter** | Mean deviation of RTT (RFC 3550) |
| **▪▪▪** | 60-point rolling sparkline (newest on the right) |

Rows showing `* * *` are hops that did not respond — common for routers configured to drop ICMP TTL-exceeded messages.

## 5. Stop and Reset

- **Stop** (`Ctrl+Enter` again) — freezes the stats. The session is saved to [History]({{< relref "/interface/history-view" >}}) automatically.
- **Reset** (`Ctrl+R`) — clears all stats and restarts counting from zero without stopping the probe loop.
