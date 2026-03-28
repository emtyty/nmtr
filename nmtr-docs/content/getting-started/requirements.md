---
title: "Requirements"
weight: 1
---

# Requirements

## System Requirements

| Requirement | Details |
|---|---|
| **OS** | Windows 10 or Windows 11 (x64 only) |
| **Privileges** | Administrator — required for raw ICMP socket access |
| **Architecture** | x64 (ARM64 not currently supported) |

## Why Administrator?

NMTR calls `IcmpSendEcho` from `Iphlpapi.dll` directly to send ICMP probes with custom TTL values. This Windows API requires the process to be elevated. The installer automatically sets the `requireAdministrator` manifest flag so Windows will prompt for elevation on launch.

If the ICMP API cannot be loaded (for example, in a restricted environment), NMTR falls back to spawning `ping.exe` subprocesses. Results in fallback mode may be slightly less precise because RTT is measured by wall clock rather than the kernel.

## Development Requirements

Only needed if you are building from source:

| Tool | Minimum version |
|---|---|
| Node.js | 18.x |
| npm | 9.x |
| Python | 3.x (required by node-gyp for native build) |
| Visual Studio Build Tools | 2019 or later (C++ workload) |

> The Visual Studio Build Tools are needed to rebuild the `koffi` native module against the Electron runtime.
