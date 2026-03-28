---
title: "WHOIS Lookup"
weight: 2
---

# WHOIS Lookup

NMTR can perform a WHOIS query for any hop IP without leaving the application.

## Triggering a Lookup

Right-click any hop row in the hop table and select **View WHOIS**. The lookup runs in the main process using the `node-whois` library and results are displayed in a modal dialog.

The same option is available from the node context menu in the [Network Path Graph]({{< relref "/visualizations/path-graph" >}}).

## WHOIS Dialog

The dialog shows the raw WHOIS response text for the queried IP. This typically includes:

- **Network block** — the CIDR range that owns the IP
- **Organization** — the registered owner (ISP, company, cloud provider)
- **Country** — the country of registration
- **Abuse contact** — email or URL for abuse reporting
- **Created / updated dates** — when the network record was last modified

## Limitations

- WHOIS queries make an outbound network connection to the appropriate WHOIS server. Results depend on internet connectivity at query time.
- Some IP ranges (especially those owned by large providers) have minimal public WHOIS records.
- Private/RFC-1918 addresses will return no results.
