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
    importCookie: (text) => invoke('auth:importCookie', text),
    logout: () => invoke('auth:logout'),
    simulateExpiry: () => invoke('auth:simulateExpiry'),
    onRequired: on('auth:required'),
    onChanged: on('auth:changed')
  },
  parse: (input) => invoke('parse', input),
  parseMore: (source, page) => invoke('parseMore', source, page),
  parseBatch: (inputs) => invoke('parseBatch', inputs),
  onParseProgress: on('parse:progress'),
  streamInfo: (item) => invoke('streamInfo', item),
  myFavFolders: () => invoke('myFavFolders'),
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
  history: {
    downloadedKeys: () => invoke('history:downloadedKeys'),
    clearDownloads: () => invoke('history:clearDownloads'),
    parses: () => invoke('history:parses'),
    removeParse: (input) => invoke('history:removeParse', input),
    clearParses: () => invoke('history:clearParses')
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    chooseDir: () => invoke('settings:chooseDir')
  },
  subs: {
    list: () => invoke('subs:list'),
    add: (req) => invoke('subs:add', req),
    update: (id, patch) => invoke('subs:update', id, patch),
    remove: (id) => invoke('subs:remove', id),
    check: (id) => invoke('subs:check', id),
    onUpdate: on('subs:update')
  },
  net: {
    status: () => invoke('net:status'),
    test: () => invoke('net:test'),
    cdnHosts: () => invoke('net:cdnHosts'),
    pingCdn: () => invoke('net:pingCdn')
  },
  config: {
    exportTo: () => invoke('config:export'),
    importFrom: () => invoke('config:import')
  },
  mcp: {
    status: () => invoke('mcp:status'),
    regenerateToken: () => invoke('mcp:regenerateToken')
  },
  readClipboard: () => invoke('clipboard:read'),
  writeClipboard: (text) => invoke('clipboard:write', text),
  showInFolder: (path) => invoke('shell:showInFolder', path),
  openFullDiskAccessSettings: () => invoke('shell:openFullDiskAccess')
}

contextBridge.exposeInMainWorld('api', api)
