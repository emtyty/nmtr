---
title: "Export Formats"
weight: 1
---

# Export Formats

Open the **Export** dropdown in the top-right of the controls bar to export the active session. Three formats are available.

## Text (WinMTR-compatible)

Exports a plain-text table that is layout-compatible with WinMTR's copy-to-clipboard format. The text is **copied directly to the clipboard** — no file dialog is shown.

Example output:

```
|                                      WinMTR statistics                                   |
|                       Host              -   %  | Sent | Recv | Best | Avrg | Wrst | Last |
|------------------------------------------------|------|------|------|------|------|------|
|                          192.168.1.1    -    0 |  120 |  120 |    1 |    2 |    5 |    2 |
|                    10.10.10.1    -    0 |  120 |  120 |   15 |   16 |   22 |   15 |
|                   dns.google    -    0 |  120 |  120 |   18 |   20 |   28 |   19 |
```

Use this format when sharing results in issue trackers, forums, or support tickets.

## CSV

Exports a comma-separated values file. A system file-save dialog opens to choose the destination.

Columns exported:
```
Hop,Host,IP,Loss%,Sent,Recv,Last,Avg,Best,Worst,Jitter,ASN,ISP,Country,City
```

Each row corresponds to one hop. `* * *` hops are included with empty stat fields. Use this format for importing into spreadsheets or analysis tools.

## HTML

Exports a self-contained HTML file with an inline-styled table. A system file-save dialog opens. The file can be opened in any browser with no external dependencies — useful for archiving or sharing readable reports by email.

The HTML report includes:
- Session metadata (target, protocol, start time, duration)
- Full hop table with all stats
- Colour-coded Loss% column

## Keyboard Shortcut

`Ctrl+E` exports the active session as **Text** and copies it to the clipboard — the fastest way to grab results.
