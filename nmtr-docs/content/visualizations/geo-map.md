---
title: "Geo World Map"
weight: 1
---

# Geo World Map

The **Map** tab displays all geo-located hops as markers on an interactive world map.

## Offline Operation

The map uses a bundled TopoJSON dataset (`world-atlas`) rendered via `react-simple-maps`. It makes **zero network requests** — the map tiles, country outlines, and all geographic data are included in the application bundle. It works fully offline.

## Hop Markers

Each hop that has latitude/longitude data (from the GeoIP lookup) appears as a circular marker on the map. Hops without geo data (private IPs, unresolvable addresses) are omitted.

Marker appearance:
- The marker colour reflects the hop's loss/latency status
- Hovering a marker shows a tooltip with the hop number, IP, hostname, ASN, city, and country

## Tooltips

Hover over any marker to see:

```
Hop 5
142.250.74.110
google.com
AS15169 Google LLC
Frankfurt, DE
```

## Pan and Zoom

The map supports mouse-drag panning and scroll-wheel zoom. Double-click a marker to zoom in on that region.

## GeoIP Data Source

Geographic coordinates come from [ip-api.com](http://ip-api.com). Lookups are:
- **Rate-limited** — queued through `p-queue` to respect the free-tier limit
- **LRU-cached** — repeated lookups for the same IP return the cached result instantly

Private/RFC-1918 IP ranges are not sent to ip-api.com and will not appear on the map.
