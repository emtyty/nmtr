---
title: "Network Scanning"
weight: 1
---

# Network Scanning

Click **Scan Network** (or **Rescan**) to discover devices on your local subnet.

## How It Works

The scan runs in four phases:

1. **Interface enumeration** — detects all active network adapters (Wi-Fi, Ethernet, VPN, Cloudflare WARP) and their IP/subnet information
2. **Ping sweep** — sends a single ICMP echo to every IP in the local /24 subnet to populate the system ARP cache
3. **ARP table read** — parses the OS ARP table (`arp -a`) to find all devices that responded, filtered to the same subnet
4. **Hostname resolution** — resolves each discovered IP using a three-tier fallback chain

## Hostname Resolution

Most home routers run a local DNS forwarder that knows every DHCP client's name. NMTR queries your gateway directly as the DNS server to get reliable LAN hostnames.

Fallback chain:

| Method | How | Best for |
|---|---|---|
| **Gateway DNS** | `nslookup <ip> <gateway>` | All DHCP clients — most reliable |
| **Reverse DNS** | Node.js `dns.reverse()` | Devices registered in system DNS |
| **NetBIOS** | `nbtstat -A <ip>` (Windows) | Windows PCs, NAS devices, printers |

If your system DNS points to a public resolver (e.g. `1.1.1.1`), the gateway DNS fallback is what makes LAN hostname resolution work — public DNS servers don't know local device names.

## Subnet Filtering

Only devices on the same subnet as your active interface are shown. If you have multiple interfaces (e.g. Wi-Fi + VPN), the scan uses all their subnets but does not scan larger than /24 to avoid flooding the network.
