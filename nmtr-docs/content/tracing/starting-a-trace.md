---
title: "Starting a Trace"
weight: 1
---

# Starting a Trace

## Target Field

Enter any IPv4 hostname or address. Hostnames are resolved via DNS to an IPv4 address before the first probe fires. The resolved IP is then cached for the lifetime of the session — if DNS changes mid-session, the cached IP continues to be used.

Examples:
```
8.8.8.8
cloudflare.com
192.168.1.1
10.0.0.1
```

## Protocol

| Protocol | Description |
|---|---|
| **ICMP** (default) | Sends ICMP Echo Requests via `IcmpSendEcho`. Most compatible; works against virtually all targets. |
| **UDP** | Sends UDP datagrams to the configured port. Useful when ICMP is filtered at the destination. |
| **TCP** | Sends TCP SYN packets to the configured port. Useful for testing application-level reachability. |

> UDP and TCP modes use the `pingus` engine. ICMP uses the `koffi` FFI native engine.

## Interval

How often a probe round is fired per hop. Shorter intervals give more responsive stats; longer intervals reduce network load.

| Option | Probes / minute (per hop) |
|---|---|
| 500 ms | 120 |
| 1 s | 60 |
| 2 s | 30 |
| 5 s | 12 |

The default is **500 ms**.

## Packet Size

The ICMP payload size in bytes. Valid range: **28–1472** bytes. The default is **64** bytes, matching WinMTR's default. Larger packets can reveal MTU-related issues along the path.

## Max Hops

The maximum TTL to probe. Default: **30**. NMTR expands the hop range dynamically as it discovers hops — you rarely need to change this unless tracing very long paths.

## Route Discovery Phase

When you press Start, NMTR first runs `tracert` to build an initial picture of the path. During this phase the hop table may populate row by row as `tracert` output arrives. Once discovery completes, the 📡 **Tracert** button appears, and the parallel ICMP probe loop takes over for all subsequent stat updates.
