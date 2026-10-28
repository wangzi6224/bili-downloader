import { contextBridge, ipcRenderer } from 'electron'
import type { BiliApi } from '@shared/types'

type Result = { ok: true; data: unknown } | { ok: false; error: string }

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Result
  if (!r.ok) throw new Error(r.error)
  return r.data as T
}

function on<A extends unknown[]>(channel: string) {
  return (cb: (...args: A) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api: BiliApi = {
  auth: {
    check: () => invoke('auth:check'),
    openLoginWindow: () => invoke('auth:login'),
    listBrowsers: () => invoke('auth:listBrowsers'),
    importFromBrowser: (id) => invoke('auth:import', id),
    logout: () => invoke('auth:logout'),
    simulateExpiry: () => invoke('auth:simulateExpiry'),
    onRequired: on('auth:required'),
    onChanged: on('auth:changed')
  },
  parse: (input) => invoke('parse', input),
  qualities: (item) => invoke('qualities', item),
  download: {
    enqueue: (req) => invoke('dl:enqueue', req),
    list: () => invoke('dl:list'),
    pause: (id) => invoke('dl:pause', id),
    resume: (id) => invoke('dl:resume', id),
    resumeAll: () => invoke('dl:resumeAll'),
    cancel: (id) => invoke('dl:cancel', id),
    retry: (id) => invoke('dl:retry', id),
    redownload: (id) => invoke('dl:redownload', id),
    clearFinished: () => invoke('dl:clearFinished'),
    onUpdate: on('dl:update')
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    chooseDir: () => invoke('settings:chooseDir')
  },
  readClipboard: () => invoke('clipboard:read'),
  showInFolder: (path) => invoke('shell:showInFolder', path),
  openFullDiskAccessSettings: () => invoke('shell:openFullDiskAccess')
}

contextBridge.exposeInMainWorld('api', api)
