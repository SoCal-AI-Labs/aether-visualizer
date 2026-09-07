import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
} from 'electron'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { initMain } = require('electron-audio-loopback') as {
  initMain: (options?: { sourcesOptions?: { types: string[] } }) => void
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

app.setName('Aether')
app.setPath('userData', path.join(app.getPath('appData'), 'AetherVisualizer'))
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('enable-usermedia-screen-capturing')

// Must run before app ready so Chromium loopback flags are applied.
initMain({
  sourcesOptions: { types: ['screen'] },
})

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

const BROWSER_RE = /firefox|mozilla|chrome|chromium|edge|brave|opera|vivaldi|arc\b/i

let mainWindow: BrowserWindow | null = null
let browserWebContentsId: number | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#050508',
    autoHideMenuBar: true,
    title: 'Aether',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  // The shell window only ever hosts the bundled renderer; refuse popups and
  // navigations away from it so a compromised page cannot escape the sandbox.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const distUrl = `file://${RENDERER_DIST.replace(/\\/g, '/').replace(/^\/?/, '/')}`
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let allowed = false
    try {
      allowed = VITE_DEV_SERVER_URL
        ? new URL(url).origin === new URL(VITE_DEV_SERVER_URL).origin
        : decodeURIComponent(url).startsWith(distUrl)
    } catch {
      allowed = false
    }
    if (!allowed) event.preventDefault()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('Renderer failed to load', code, desc)
    mainWindow?.show()
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('Preload failed', preloadPath, error)
  })

  mainWindow.webContents.on('did-attach-webview', (_event, contents) => {
    browserWebContentsId = contents.id
    contents.setBackgroundThrottling(false)
    contents.setWindowOpenHandler(({ url }) => {
      // Keep popups inside the embedded browser and only follow web URLs.
      if (/^https?:\/\//i.test(url)) contents.loadURL(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!/^(https?|about):/i.test(url)) event.preventDefault()
    })
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    browserWebContentsId = null
  })
}

function mapSources(sources: Electron.DesktopCapturerSource[]) {
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }))
}

function installLoopbackHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      })
      if (!sources[0]) {
        callback({})
        return
      }
      callback({
        video: sources[0],
        audio: 'loopback',
      })
    },
    { useSystemPicker: false },
  )
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = new Set(['media', 'display-capture', 'mediaKeySystem'])
    callback(allowed.has(permission))
  })
  installLoopbackHandler()

  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 180, height: 110 },
      fetchWindowIcons: true,
    })
    return mapSources(sources)
  })

  ipcMain.handle('get-browser-windows', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 180, height: 110 },
      fetchWindowIcons: true,
    })
    const windows = sources.sort((a, b) => {
      const aHit = BROWSER_RE.test(a.name) ? 0 : 1
      const bHit = BROWSER_RE.test(b.name) ? 0 : 1
      return aHit - bHit
    })
    return mapSources(windows)
  })

  ipcMain.handle('set-browser-contents', (_event, id: number | null) => {
    browserWebContentsId = id
    return browserWebContentsId
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
