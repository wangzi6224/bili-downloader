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
  platform: process.platform,
  auth: {
    check: () => invoke('auth:check'),
    accounts: () => invoke('auth:accounts'),
    switchAccount: (mid) => invoke('auth:switchAccount', mid),
    removeAccount: (mid) => invoke('auth:removeAccount', mid),
    assignLegacy: (mid) => invoke('auth:assignLegacy', mid),
    onAccountsChanged: on('auth:accountsChanged'),
    openLoginWindow: (target) => invoke('auth:login', target),
    listBrowsers: () => invoke('auth:listBrowsers'),
    chooseBrowserFolder: (id) => invoke('auth:chooseBrowserFolder', id),
    importFromBrowser: (id, target) => invoke('auth:import', id, target),
    importCookie: (text, target) => invoke('auth:importCookie', text, target),
    logout: () => invoke('auth:logout'),
    simulateExpiry: () => invoke('auth:simulateExpiry'),
    onRequired: on('auth:required'),
    onChanged: on('auth:changed')
  },
  parse: (input, mid) => mid === undefined ? invoke('parse', input) : invoke('parse', input, mid),
  parseMore: (source, page, mid) => mid === undefined
    ? invoke('parseMore', source, page)
    : invoke('parseMore', source, page, mid),
  parseBatch: (inputs) => invoke('parseBatch', inputs),
  onParseProgress: on('parse:progress'),
  streamInfo: (item, mid) => invoke('streamInfo', item, mid),
  myFavFolders: () => invoke('myFavFolders'),
  sources: {
    listAccount: (mid, category, page) => invoke('sources:listAccount', mid, category, page),
    open: (source) => invoke('sources:open', source),
    prepareItems: (items, accountMid) => accountMid === undefined
      ? invoke('sources:prepareItems', items)
      : invoke('sources:prepareItems', items, accountMid),
    subscribeDownload: (source) => invoke('sources:subscribeDownload', source)
  },
  download: {
    enqueue: (req, accountMid) => accountMid === undefined ? invoke('dl:enqueue', req) : invoke('dl:enqueue', req, accountMid),
    list: () => invoke('dl:list'),
    pause: (id) => invoke('dl:pause', id),
    pauseMany: (ids) => invoke('dl:pauseMany', ids),
    pauseAll: () => invoke('dl:pauseAll'),
    resume: (id) => invoke('dl:resume', id),
    resumeMany: (ids) => invoke('dl:resumeMany', ids),
    resumeAll: () => invoke('dl:resumeAll'),
    remove: (ids, deleteFiles) => invoke('dl:remove', ids, deleteFiles),
    retry: (id) => invoke('dl:retry', id),
    redownload: (id) => invoke('dl:redownload', id),
    clearFinished: (deleteFiles) => invoke('dl:clearFinished', deleteFiles),
    onUpdate: on('dl:update')
  },
  watermark: {
    prepare: (taskId) => invoke('wm:prepare', taskId),
    frame: (taskId, time, region) => invoke('wm:frame', taskId, time, region),
    start: (taskId, region, mode) => invoke('wm:start', taskId, region, mode),
    cancel: (taskId) => invoke('wm:cancel', taskId),
    aiStatus: () => invoke('wm:ai:status'),
    aiDownload: () => invoke('wm:ai:download'),
    aiCancelDownload: () => invoke('wm:ai:cancel'),
    aiRemove: () => invoke('wm:ai:remove'),
    onAiStatus: on('wm:ai:status'),
    aiEstimate: (taskId, region) => invoke('wm:ai:estimate', taskId, region),
    aiPreview: (taskId, time, region) => invoke('wm:ai:preview', taskId, time, region),
    aiRelease: (taskId) => invoke('wm:ai:release', taskId),
    speed: () => invoke('wm:speed')
  },
  history: {
    downloadedKeys: () => invoke('history:downloadedKeys'),
    onDownloadsChanged: on('history:downloadsChanged'),
    clearDownloads: () => invoke('history:clearDownloads'),
    parses: () => invoke('history:parses'),
    removeParse: (input, accountMid) => accountMid === undefined
      ? invoke('history:removeParse', input)
      : invoke('history:removeParse', input, accountMid),
    clearParses: () => invoke('history:clearParses')
  },
  i18n: {
    get: () => invoke('i18n:get'),
    onChanged: on('i18n:changed')
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    chooseDir: () => invoke('settings:chooseDir'),
    onChanged: on('settings:changed')
  },
  subs: {
    list: () => invoke('subs:list'),
    add: (req, mid) => invoke('subs:add', req, mid),
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
  app: {
    onCloseRequested: on('app:closeRequested'),
    onOpenSettings: on('app:openSettings'),
    close: (action, remember) => invoke('app:close', action, remember)
  },
  update: {
    state: () => invoke('update:state'),
    check: () => invoke('update:check'),
    download: () => invoke('update:download'),
    cancel: () => invoke('update:cancel'),
    install: () => invoke('update:install'),
    skip: () => invoke('update:skip'),
    openPage: () => invoke('update:openPage'),
    onState: on('update:state'),
    onPrompt: on('update:prompt')
  },
  readClipboard: () => invoke('clipboard:read'),
  writeClipboard: (text) => invoke('clipboard:write', text),
  showInFolder: (path) => invoke('shell:showInFolder', path)
}

contextBridge.exposeInMainWorld('api', api)
