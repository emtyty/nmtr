import { app, BrowserWindow, ipcMain, nativeTheme, session } from 'electron'
import { join } from 'path'
import { registerHandlers, setTrayManager, applyLaunchAtLogin } from './ipc/handlers'
import { ProberManager } from './prober/ProberManager'
import { MonitorEngine } from './monitor/MonitorEngine'
import { TrayManager } from './tray/TrayManager'
import { AppSettingsStore } from './store/AppSettings'
import { initAutoUpdater, checkForUpdates } from './updater/AutoUpdater'
import { createLogoIcon } from './utils/logoIcon'

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null

function createWindow(): void {
  const settings = AppSettingsStore.get()
  const icon = createLogoIcon(32)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 900,
    minHeight: 500,
    frame: false, // frameless — custom title bar
    backgroundColor: '#1e1e24',
    titleBarStyle: 'hidden',
    icon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // required by electron-vite's externalizeDepsPlugin (preload needs require)
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Apply system theme preference
  if (settings.theme === 'system') {
    nativeTheme.themeSource = 'system'
  } else {
    nativeTheme.themeSource = settings.theme
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.maximize()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    const s = AppSettingsStore.get()
    if (s.minimizeToTray && trayManager) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Window control IPC (frameless window needs these)
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => {
  const s = AppSettingsStore.get()
  if (s.minimizeToTray && trayManager) mainWindow?.hide()
  else mainWindow?.close()
})

app.whenReady().then(async () => {
  await ProberManager.initialize()

  // Set Content Security Policy (production only — Vite dev server needs inline scripts/WS)
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' https://get.geojs.io https://api.macvendors.com https://api.github.com; " +
            "object-src 'none'; " +
            "base-uri 'self'"
          ]
        }
      })
    })
  }

  // Create window first so mainWindow is non-null when handlers are registered
  createWindow()

  registerHandlers(mainWindow!)
  initAutoUpdater(mainWindow!)

  const startupSettings = AppSettingsStore.get()

  // Sync the OS login-item registration with the saved preference.
  applyLaunchAtLogin(startupSettings.launchAtLogin)

  // Auto-check for updates shortly after launch, if enabled (manual button
  // always works regardless). Delayed so it never competes with first paint.
  if (startupSettings.checkUpdatesOnStartup) {
    setTimeout(() => { void checkForUpdates() }, 4000)
  }

  // Start scheduled monitors in the background (reads persisted configs).
  MonitorEngine.start(mainWindow!)

  trayManager = new TrayManager(mainWindow!)
  setTrayManager(trayManager)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ProberManager.destroyAll()
    MonitorEngine.stop()
    app.quit()
  }
})

app.on('before-quit', () => {
  ProberManager.destroyAll()
  MonitorEngine.stop()
})

export { mainWindow }
