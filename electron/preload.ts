import { contextBridge, ipcRenderer } from 'electron'

export type DesktopSource = {
  id: string
  name: string
  thumbnail: string
}

const api = {
  getSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke('get-sources'),
  getBrowserWindows: (): Promise<DesktopSource[]> =>
    ipcRenderer.invoke('get-browser-windows'),
  enableLoopbackAudio: () => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),
  setBrowserContents: (id: number | null) =>
    ipcRenderer.invoke('set-browser-contents', id),
  platform: process.platform,
}

contextBridge.exposeInMainWorld('aether', api)

export type AetherApi = typeof api
