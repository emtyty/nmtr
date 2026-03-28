---
title: "Settings"
weight: 1
---

# Settings

Open Settings with `Ctrl+,` or via the gear icon. Changes take effect after clicking **Save**.

## Theme

Controls the application colour scheme.

| Option | Description |
|---|---|
| **Dark** (default) | Dark background, light text |
| **Light** | Light background, dark text |
| **System** | Follows the Windows system light/dark preference |

## Default Protocol

Sets the protocol pre-selected in the controls bar for new sessions.

| Option | Engine used |
|---|---|
| **ICMP** (default) | Native `IcmpSendEcho` via koffi FFI |
| **UDP** | pingus engine |
| **TCP** | pingus engine |

## Default Probe Interval

How frequently probe rounds fire. This is a per-session default; you can change it per-session in the controls bar.

| Option | Notes |
|---|---|
| **500 ms** (default) | High-resolution stats; slightly more network traffic |
| 1 s | Balanced — matches WinMTR's default |
| 2 s | Low traffic environments |
| 5 s | Very low-frequency monitoring |

## Max Hops

The maximum TTL to probe. Valid range: **1–30**. Default: **30**. Reduce this if you only care about the first N hops (e.g., within your own network).

## Packet Size

ICMP payload size in bytes. Valid range: **28–1472**. Default: **64**. Larger values can reveal path MTU issues. The maximum 1472 bytes leaves room for ICMP and IP headers within a standard 1500-byte Ethernet MTU.

## Resolve Hostnames

When enabled (default), NMTR performs a reverse DNS (`PTR`) lookup for each new hop IP and displays the hostname in the hop table. Disable this to reduce DNS traffic or speed up the initial enrichment phase.

## Minimize to Tray on Close

When enabled (default), clicking the window close button hides NMTR to the system tray instead of exiting. The application continues running in the background and all trace sessions remain active. To fully quit, right-click the tray icon and select **Quit**.

## Check for Updates

Triggers an immediate check against GitHub Releases. If a newer version is found, the update banner appears at the top of the window.

## Settings File Location

Settings are stored via `electron-store` at:
```
%APPDATA%\nmtr\config.json
```
