---
title: "Device Detection"
weight: 3
---

# Device Detection

NMTR identifies each device's type and vendor using multiple data sources.

## Device Type Inference

Device type is inferred from hostname patterns and vendor name, checked in priority order:

1. **Hostname patterns** — regex matching against the resolved hostname (e.g. `Linh-s-S25` matches Samsung phone pattern `s-S\d+`)
2. **Vendor fallback** — if hostname doesn't match, the vendor name is checked (e.g. vendor `Samsung` defaults to phone, `Intel` to laptop)
3. **Unknown** — if neither matches, the device is shown as a generic device

Supported device types: Router, Access Point, Laptop, Desktop, Phone, Tablet, Camera, IoT, Printer, Media Player, Server.

## MAC Vendor Lookup

Vendor identification uses a two-tier approach:

| Tier | Method | Speed | Coverage |
|---|---|---|---|
| **Local OUI table** | Built-in map of ~120 common MAC prefixes | Instant | Major vendors (Apple, Samsung, TP-Link, Intel, Dell, etc.) |
| **Online API** | Queries `api.macvendors.com` for the MAC prefix | ~200ms | Full IEEE OUI database |

The online API is only queried for MACs not found in the local table.

## Randomized MACs

Modern devices (iOS 14+, Android 10+, Windows 10+) use **MAC address randomization** on Wi-Fi. These MACs have bit 1 of the first octet set (the "locally administered" flag).

NMTR detects randomized MACs and:
- Skips the online vendor API (randomized MACs have no real OUI)
- Shows "Randomized MAC" in the device list and tooltip
- Labels them with a `rand` tag in the MAC address column

For these devices, the **hostname** becomes the primary identification method — which is why gateway DNS resolution is essential.

## Vendor Inference from Hostname

When MAC-based vendor lookup fails (randomized MAC), NMTR falls back to hostname pattern matching:

| Hostname pattern | Inferred vendor |
|---|---|
| `Linh-s-S25`, `Nhi-s-A13`, `Galaxy-*` | Samsung |
| `iPhone-*`, `iPad-*`, `MacBook-*`, `Mac` | Apple |
| `C6N_*_EZVIZ` | EZVIZ |
| `covr*` | D-Link |
| `espressif` | Espressif |
| `Pixel-*` | Google |
| And many more... | |

This ensures vendor information is available even when MAC randomization is active.
