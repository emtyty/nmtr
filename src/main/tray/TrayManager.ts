import { Tray, Menu, app, nativeImage } from 'electron'
import { join } from 'path'
import type { BrowserWindow } from 'electron'

export class TrayManager {
  private tray: Tray | null = null
  private window: BrowserWindow

  constructor(window: BrowserWindow) {
    this.window = window
    this.create()
  }

  private create(): void {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'tray-icon.png')
      : join(__dirname, '../../../resources/tray-icon.png')

    let icon
    try {
      icon = nativeImage.createFromPath(iconPath)
      if (icon.isEmpty()) {
        icon = this.createProgrammaticIcon()
      }
    } catch {
      icon = this.createProgrammaticIcon()
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('nmtr — Network Diagnostic Tool')
    this.updateMenu()

    this.tray.on('double-click', () => {
      this.window.show()
      this.window.focus()
    })
  }

  private createProgrammaticIcon(): Electron.NativeImage {
    // 16x16 diamond icon in accent-blue (#58a6ff) on transparent background
    // Pixel format: RGBA
    const size = 16
    const buffer = Buffer.alloc(size * size * 4, 0)
    const cx = 7.5
    const cy = 7.5
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = Math.abs(x - cx)
        const dy = Math.abs(y - cy)
        const dist = dx + dy
        const idx = (y * size + x) * 4
        if (dist <= 6.5) {
          if (dist >= 5.5) {
            // Border: accent-blue #58a6ff
            buffer[idx] = 0x58     // R
            buffer[idx + 1] = 0xa6 // G
            buffer[idx + 2] = 0xff // B
            buffer[idx + 3] = 0xff // A
          } else {
            // Fill: dark #0d1117
            buffer[idx] = 0x0d     // R
            buffer[idx + 1] = 0x11 // G
            buffer[idx + 2] = 0x17 // B
            buffer[idx + 3] = 0xff // A
          }
        }
        // else: transparent (A=0, already zeroed)
      }
    }
    return nativeImage.createFromBitmap(buffer, { width: size, height: size })
  }

  updateMenu(activeSessions: Array<{ id: string; target: string; status: string }> = []): void {
    if (!this.tray) return

    const sessionItems: Electron.MenuItemConstructorOptions[] = activeSessions.map((s) => ({
      label: `${s.target} — ${s.status}`,
      enabled: false
    }))

    const menu = Menu.buildFromTemplate([
      { label: 'nmtr', enabled: false },
      { type: 'separator' },
      ...(sessionItems.length > 0
        ? [...sessionItems, { type: 'separator' as const }]
        : []),
      {
        label: 'Show nmtr',
        click: () => {
          this.window.show()
          this.window.focus()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.tray?.destroy()
          app.exit(0)
        }
      }
    ])

    this.tray.setContextMenu(menu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
