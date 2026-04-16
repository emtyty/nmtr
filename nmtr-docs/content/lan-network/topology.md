---
title: "Topology View"
weight: 2
---

# Topology View

After a scan completes, the main area displays a hierarchical network topology diagram rendered as an interactive SVG.

## Layout Tiers

The topology follows a standard top-down network hierarchy:

```
     [  WAN  ]         Internet cloud
        |
     [ ROUTER ]        Gateway / default route
        |
     [  VPN  ]         VPN or WARP tunnel (if detected)
        |
     [ SWITCH ]──[YOU]  Local switch + your device indicator
      / | | \
    Devices...          Discovered LAN devices
```

Each tier is connected by bezier curves. Hovering a device highlights its connection path.

## Device Icons

Devices are drawn with distinct SVG icons based on their detected type:

| Icon | Type | Detection method |
|---|---|---|
| Rounded rectangle (tall) | Phone | Hostname patterns: `S25`, `A13`, `Galaxy`, `iPhone` |
| Wide rectangle | Tablet | `iPad`, `Surface`, `Kindle` |
| Monitor + base | Laptop / Desktop | `LAPTOP-`, `DESKTOP-`, `MacBook`, `Mac` |
| Lens circle | Camera | `EZVIZ`, `C6N`, `Hikvision` |
| Rounded square | IoT | `espressif`, `tuya`, `sonoff`, `shelly` |
| Box with tray | Printer | `Brother`, `Epson`, `HP Jet` |
| Rectangle with play | Media | `Roku`, `Chromecast`, `Fire TV`, `Apple TV` |
| Router arrows | Router / AP | `covr`, `D-Link`, `TP-Link`, `Netgear` |

## Interactive Features

- **Hover** — highlights the device node, its connection line, and the corresponding row in the device table
- **Tooltip** — shows hostname, IP, MAC address, vendor, device type, and role (Gateway / This Device)
- **Rescan button** — in the top bar and device table header; re-runs the full scan
