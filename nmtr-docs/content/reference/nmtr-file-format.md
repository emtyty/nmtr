---
title: ".nmtr File Format"
weight: 1
---

# .nmtr File Format

`.nmtr` files are **NDJSON** (Newline-Delimited JSON) — one JSON object per line. Every line has a `type` discriminator field.

## Line Types

### `meta` (line 1)

Always the first line of the file. Contains session configuration.

```json
{
  "type": "meta",
  "version": "0.1.0",
  "target": "8.8.8.8",
  "startedAt": 1711612800000,
  "protocol": "icmp",
  "intervalMs": 500
}
```

| Field | Type | Description |
|---|---|---|
| `version` | string | App version that created the file |
| `target` | string | Hostname or IP that was traced |
| `startedAt` | number | Unix timestamp (ms) when the session started |
| `protocol` | `"icmp"` \| `"udp"` \| `"tcp"` | Protocol used |
| `intervalMs` | number | Probe interval in milliseconds |

### `frame`

One line per probe round. Carries the full hop array snapshot.

```json
{
  "type": "frame",
  "t": 5000,
  "hops": [
    {
      "hopIndex": 1,
      "ip": "192.168.1.1",
      "hostname": "router.local",
      "enrichment": null,
      "loss": 0,
      "sent": 10,
      "recv": 10,
      "last": 2,
      "avg": 2.1,
      "best": 1,
      "worst": 4,
      "jitter": 0.3,
      "sparkline": [2, 2, 3, 1, 2, 2, null, 2, 2, 2]
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `t` | number | Milliseconds elapsed since `startedAt` |
| `hops` | `HopStats[]` | Full snapshot of all hop stats at this moment |

### `routechange`

Emitted when a hop's responding IP changes mid-session.

```json
{
  "type": "routechange",
  "t": 12500,
  "hopIndex": 4,
  "oldIP": "10.0.0.1",
  "newIP": "10.0.0.5"
}
```

| Field | Type | Description |
|---|---|---|
| `t` | number | Milliseconds elapsed since `startedAt` |
| `hopIndex` | number | 1-based TTL where the change occurred |
| `oldIP` | string | IP that was previously responding |
| `newIP` | string | IP that replaced it |

## HopStats Object

The `hops` array in each `frame` line contains `HopStats` objects:

| Field | Type | Description |
|---|---|---|
| `hopIndex` | number | 1-based TTL |
| `ip` | string \| null | Replying IP, or `null` for no-reply hops |
| `hostname` | string \| null | Reverse-DNS hostname |
| `enrichment` | object \| null | ASN, ISP, country, city, lat, lng |
| `loss` | number | Loss percentage 0–100 |
| `sent` | number | Total probes sent |
| `recv` | number | Total replies received |
| `last` | number \| null | Last RTT in ms |
| `avg` | number \| null | Mean RTT in ms |
| `best` | number \| null | Minimum RTT in ms |
| `worst` | number \| null | Maximum RTT in ms |
| `jitter` | number \| null | Mean deviation in ms |
| `sparkline` | `(number \| null)[]` | 60-point rolling buffer, newest at tail |

## Example File

```ndjson
{"type":"meta","version":"0.1.0","target":"8.8.8.8","startedAt":1711612800000,"protocol":"icmp","intervalMs":500}
{"type":"frame","t":500,"hops":[{"hopIndex":1,"ip":"192.168.1.1","hostname":null,"enrichment":null,"loss":0,"sent":1,"recv":1,"last":2,"avg":2,"best":2,"worst":2,"jitter":0,"sparkline":[2]}]}
{"type":"frame","t":1000,"hops":[{"hopIndex":1,"ip":"192.168.1.1","hostname":"router.local","enrichment":null,"loss":0,"sent":2,"recv":2,"last":1,"avg":1.5,"best":1,"worst":2,"jitter":0.5,"sparkline":[2,1]}]}
{"type":"routechange","t":5000,"hopIndex":3,"oldIP":"10.0.1.1","newIP":"10.0.1.2"}
```
