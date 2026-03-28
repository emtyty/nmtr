---
title: "Installation"
weight: 2
---

# Installation

## Installer (Recommended)

1. Go to the [Releases](https://github.com/your-org/nmtr/releases) page.
2. Download `nmtr-setup-x.x.x.exe`.
3. Run the installer — Windows will prompt for administrator approval.
4. NMTR launches automatically after installation.

The installer creates a Start Menu shortcut and registers NMTR for auto-start with elevation.

## Portable Executable

A standalone `nmtr-x.x.x-portable.exe` is available on the Releases page if you prefer not to install. Right-click the file and choose **Run as administrator** — NMTR requires elevation to open ICMP sockets.

## Building from Source

```bash
# 1. Clone the repository
git clone https://github.com/your-org/nmtr.git
cd nmtr

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Rebuild koffi against the bundled Electron runtime
npm run rebuild

# 4. Start the dev server with hot reload
npm run dev
```

> Open the terminal **as Administrator** so the ICMP engine can open the socket during development. Without elevation the engine falls back to `ping.exe`.

### Production Build

```bash
# Compile renderer + main bundles
npm run build

# Package as NSIS installer + portable exe
npm run dist:win
```

Output files are written to `dist-release/`.

## Auto-Updates

Once installed, NMTR checks GitHub Releases for updates automatically. A banner appears at the top of the window when an update is available. You can also trigger a manual check via **Settings → Check for Updates**.
