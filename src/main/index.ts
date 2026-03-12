import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { registerHandlers } from './ipc/handlers'
import { ProberManager } from './prober/ProberManager'
import { TrayManager } from './tray/TrayManager'
import { AppSettingsStore } from './store/AppSettings'

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null

function createWindow(): void {
  const settings = AppSettingsStore.get()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 900,
    minHeight: 500,
    frame: false, // frameless — custom title bar
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
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

  // Create window first so mainWindow is non-null when handlers are registered
  createWindow()

  registerHandlers(mainWindow!)

  trayManager = new TrayManager(mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ProberManager.destroyAll()
    app.quit()
  }
})

app.on('before-quit', () => {
  ProberManager.destroyAll()
})

export { mainWindow }
