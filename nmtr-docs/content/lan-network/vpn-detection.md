---
title: "VPN & WARP Detection"
weight: 4
---

# VPN & WARP Detection

NMTR detects VPN tunnels and Cloudflare WARP by inspecting network interface names.

## How Detection Works

Each network adapter name is matched against known patterns:

| Type | Interface name patterns |
|---|---|
| **VPN** | `tap`, `tun`, `vpn`, `wireguard`, `wg0`, `nordlynx`, `proton`, `mullvad`, `openvpn`, `zerotier`, `tailscale`, `utun`, `ppp` |
| **Cloudflare WARP** | `cloudflare`, `warp`, `cf-warp` |
| **Wi-Fi** | `wi-fi`, `wlan`, `wireless`, `airport` |
| **Ethernet** | `eth`, `en0`, `ethernet`, `local area` |

## UI Indicators

When a VPN or WARP interface is detected:

- A **VPN Active** badge appears in the top bar next to the interface list
- The topology diagram inserts a **VPN/WARP shield tier** between the Router and Switch layers, showing the tunnel adapter name and IP
- VPN interfaces are listed with a yellow/orange color in the interface badges

## Interface Badges

The top bar shows all active network interfaces as colored badges:

| Badge color | Interface type |
|---|---|
| Blue | Wi-Fi |
| Green | Ethernet |
| Yellow | VPN |
| Orange | Cloudflare WARP |
| Gray | Other |

Each badge shows the adapter name and its local IP address.
