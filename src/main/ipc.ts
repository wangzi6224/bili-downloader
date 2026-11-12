import { clipboard, dialog, ipcMain, shell } from 'electron'
import { randomBytes } from 'node:crypto'
import type {
  AccountSourceCategory,
  CloseAction,
  EnqueueRequest,
  LoginTarget,
  MediaItem,
  NewSubscription,
  PagedSource,
  SourceDownloadChoice,
  ParseResult,
  Settings,
  SourceDetails,
  SourceRef,
  Subscription,
  WatermarkMethod,
  WatermarkRegion
} from '@shared/types'
import { checkAuth, ensureLoggedIn, getAuthState, logout, requireLogin } from './auth/authGuard'
import type { accounts } from './auth/accounts'
import { activeRevision, activeScope, authScope, inAuthScope, isRetired, type AuthScope } from './auth/scope'
import { importFromBrowser, listBrowserProfiles } from './auth/browserImport'
import { chooseBrowserFolder } from './auth/browserFolder'
import { importCookieText } from './auth/cookieImport'
import { openLoginWindow } from './auth/loginWindow'
import { biliSession } from './auth/session'
import { accountSourceInput, listAccountSources } from './bili/accountSources'
import { audioStreamInfo } from './bili/audio'
import { AuthExpiredError, LoginRequiredError } from './bili/http'
import { expandLazy, loadPage, myFavFolders } from './bili/lists'
import { getPlayInfo, streamInfoFromPlay } from './bili/playurl'
import { resolveBatch, resolveInput } from './bili/resolve'
import { exportConfig, importConfig } from './config'
import type { DownloadManager } from './download/manager'
import { prepareEnqueueItems } from './enqueue'
import type { McpServer } from './mcp/server'
import { cdnHosts, pingHost } from './net/cdn'
import { networkStatus } from './net/network'
import type { SubscriptionManager } from './subscriptions'
import type { Updater } from './update/updater'
import {
  clearDownloads,
  clearParses,
  downloadedKeys,
  parseRecords,
  recordParse,
  removeParse
} from './history'
import { quitConfirmed } from './quitGuard'
import { aiModel, aiSessions } from './watermark/ai'
import { prepareManual, previewFrame, requireVideoTask } from './watermark/manual'
import { speedRatio } from './watermark/speed'
import { getLanguage, t } from '@shared/i18n'
import { normalizeOptions } from '@shared/options'
import { parseInput } from '@shared/parseUrl'
import { getSettings, updateSettings } from './settings'
import { getMainWindow, hideMainWindow, send } from './windows'

function requireAccount(mid: number): void {
  const state = getAuthState()
  if (!state.loggedIn || state.user.mid !== mid) throw new Error(t('subs.accountChanged'))
}

function currentAccount(): number {
  const state = getAuthState()
  if (!state.loggedIn) throw new Error(t('authErr.loginRequiredAccount'))
  return state.user.mid
}

function subscriptionAccount(sub: Subscription): number | undefined {
  return sub.accountMid ?? (parseInput(sub.input)?.type === 'watchlater' ? currentAccount() : undefined)
}

const FAKE_SESSDATA = 'expired-for-testing'
let stashedSessdata: { scope: AuthScope; cookie: Electron.Cookie } | undefined

async function setSessdata(value: string, expirationDate?: number): Promise<void> {
  await biliSession().cookies.set({
    url: 'https://www.bilibili.com',
    domain: '.bilibili.com',
    path: '/',
    name: 'SESSDATA',
    value,
    secure: true,
    httpOnly: true,
    expirationDate
  })
}

/** 开发调试：把 SESSDATA 换成无效值，模拟服务端判定登录过期；真实值先暂存起来 */
export async function simulateExpiry(): Promise<void> {
  const scope = authScope()
  await inAuthScope(scope, async () => {
    const [real] = await biliSession().cookies.get({ domain: 'bilibili.com', name: 'SESSDATA' })
    if (real && real.value !== FAKE_SESSDATA) stashedSessdata = { scope, cookie: real }
    await setSessdata(FAKE_SESSDATA, real?.expirationDate)
    await checkAuth()
    requireLogin()
  })
}

/** 开发调试：恢复模拟过期前的真实 SESSDATA */
export async function restoreSimulatedExpiry(): Promise<void> {
  if (!stashedSessdata) return
  const { scope, cookie } = stashedSessdata
  stashedSessdata = undefined
  if (isRetired(scope.partition)) return
  await inAuthScope(scope, async () => {
    await setSessdata(cookie.value, cookie.expirationDate)
    await checkAuth()
  })
}

/** 界面和 MCP 共用的解析入口：先确认已登录，解析后写入解析记录 */
export async function parseAndRecord(input: string): Promise<ParseResult> {
  await ensureLoggedIn()
  const auth = getAuthState()
  const result = { ...(await resolveInput(input)), input: input.trim() }
  if (isRetired(authScope().partition)) throw new AuthExpiredError()
  recordParse({
    input: input.trim(),
    title: result.title,
    kind: result.kind,
    cover: result.cover,
    count: result.groups.reduce((n, g) => n + g.items.length, 0),
    at: Date.now(),
    accountMid: auth.loggedIn ? auth.user.mid : undefined
  })
  return result
}

type Result = { ok: true; data: unknown } | { ok: false; error: string }

/** 统一包装：错误以 { ok:false } 返回，preload 再还原成 Error，避免 Electron 给消息加前缀 */
function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result> => {
    try {
      return { ok: true, data: await inAuthScope(activeScope(), () => fn(...(args as never[]))) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

export interface IpcDeps {
  manager: DownloadManager
  subs: SubscriptionManager
  mcp: McpServer
  enqueue: (req: EnqueueRequest, beforeQueue?: () => void) => Promise<string | undefined>
  updater: Updater
  accounts?: typeof accounts
  /** 问过用户后退出账号，并处理它名下的任务和订阅；返回 false 表示取消 */
  endAccount?: (mid: number) => Promise<boolean>
}

export function registerIpc({ manager, subs, mcp, enqueue, updater, accounts, endAccount }: IpcDeps): void {
  const getSubscription = (id: string): Subscription => {
    const sub = subs.list().find((item) => item.id === id)
    if (!sub) throw new Error(t('subs.sourceUnavailable'))
    return sub
  }
  const verifyView = (): (() => void) => {
    const revision = activeRevision()
    return () => {
      if (revision !== activeRevision() || isRetired(authScope().partition)) throw new Error(t('subs.accountChanged'))
    }
  }
  const forAccount = <T>(mid: number | undefined, fn: () => Promise<T>): Promise<T> =>
    accounts && mid !== undefined ? accounts.run(mid, fn, mid !== activeScope().mid) : fn()
  handle('auth:check', async () => checkAuth().catch(() => getAuthState()))
  handle('auth:accounts', () => accounts?.snapshot())
  handle('auth:switchAccount', (mid: number) => accounts?.select(mid))
  handle('auth:removeAccount', (mid: number) => endAccount ? endAccount(mid) : accounts?.remove(mid))
  handle('auth:assignLegacy', (mid: number) => accounts?.assignLegacy(mid))
  handle('auth:login', (target?: LoginTarget) => accounts ? accounts.login(openLoginWindow, target) : openLoginWindow())
  handle('auth:listBrowsers', () => listBrowserProfiles())
  handle('auth:chooseBrowserFolder', (id: string) => chooseBrowserFolder(id, getMainWindow()))
  handle('auth:import', (id: string, target?: LoginTarget) =>
    accounts ? accounts.login(() => importFromBrowser(id), target) : importFromBrowser(id))
  handle('auth:importCookie', (text: string, target?: LoginTarget) =>
    accounts ? accounts.login(() => importCookieText(text), target) : importCookieText(text))
  handle('auth:logout', () => accounts ? accounts.logout() : logout())
  handle('auth:simulateExpiry', simulateExpiry)

  handle('parse', async (input: string, mid?: number) => {
    if (mid === undefined) return parseAndRecord(input)
    const revision = activeRevision()
    const verify = verifyView()
    try {
      if (!accounts) requireAccount(mid)
      const result = await (accounts ? accounts.run(mid, () => parseAndRecord(input)) : parseAndRecord(input))
      verify()
      return result
    } catch (e) {
      if ((e instanceof AuthExpiredError || e instanceof LoginRequiredError) && revision === activeRevision()
        && accounts?.snapshot().accounts.some((account) => account.mid === mid)) {
        send('auth:required', { mode: 'reauth', mid, activate: false })
      }
      throw e
    }
  })
  handle('parseMore', (source: PagedSource, page: number, mid?: number) => forAccount(mid, async () => {
    await ensureLoggedIn()
    return loadPage(source, page)
  }))
  handle('parseBatch', async (inputs: string[]) => {
    const revision = activeRevision()
    await ensureLoggedIn()
    return resolveBatch(inputs, (done, total, title) => {
      if (revision === activeRevision()) send('parse:progress', { done, total, title })
    }, parseAndRecord)
  })
  handle('streamInfo', (item: MediaItem, mid?: number) => forAccount(mid, async () => {
    if (item.kind === 'audio') return audioStreamInfo()
    // 列表里的视频还没有 cid，先查一次详情（只取第一个分P）
    const probe = item.lazy ? (await expandLazy([item]))[0] : item
    if (probe.unavailable) throw new Error(probe.unavailable)
    return streamInfoFromPlay(await getPlayInfo(probe, 127))
  }))
  handle('myFavFolders', async () => {
    const s = await checkAuth().catch(() => getAuthState())
    if (!s.loggedIn) throw new Error(t('authErr.loginRequired'))
    return myFavFolders(s.user.mid)
  })

  handle('sources:listAccount', async (mid: number, category: AccountSourceCategory, page: number) => {
    const verify = verifyView()
    await ensureLoggedIn()
    requireAccount(mid)
    const result = await listAccountSources(mid, category, page)
    verify()
    requireAccount(mid)
    return result
  })
  handle('sources:open', async (source: SourceRef): Promise<SourceDetails> => {
    const verify = verifyView()
    if (source.type === 'subscription') {
      const sub = getSubscription(source.id)
      if (accounts && sub.accountMid !== undefined) {
        const accountMid = sub.accountMid
        const result = await forAccount(accountMid, () => resolveInput(sub.input))
        verify()
        return { result, accountMid }
      }
      await ensureLoggedIn()
      const accountMid = subscriptionAccount(sub)
      if (accountMid !== undefined) requireAccount(accountMid)
      const result = await resolveInput(sub.input)
      if (accountMid !== undefined) requireAccount(accountMid)
      return { result, accountMid }
    }
    if (source.type === 'account') {
      await ensureLoggedIn()
      requireAccount(source.mid)
      const result = await resolveInput(accountSourceInput(source.target))
      verify()
      requireAccount(source.mid)
      return { result, accountMid: source.mid }
    }
    throw new Error(t('subs.sourceUnavailable'))
  })
  handle('sources:prepareItems', async (items: MediaItem[], accountMid?: number) => {
    const verify = verifyView()
    if (accounts) {
      const prepared = await forAccount(accountMid, () => prepareEnqueueItems(items))
      verify()
      return { items: prepared.items, note: prepared.note }
    }
    await ensureLoggedIn()
    if (accountMid !== undefined) requireAccount(accountMid)
    const prepared = await prepareEnqueueItems(items)
    if (accountMid !== undefined) requireAccount(accountMid)
    return { items: prepared.items, note: prepared.note }
  })
  handle('sources:subscribeDownload', async (source: SourceRef, choice?: SourceDownloadChoice) => {
    const subscription = source.type === 'subscription' ? getSubscription(source.id) : undefined
    if (accounts) {
      const verify = verifyView()
      if (source.type === 'account') requireAccount(source.mid)
      const run = async () => {
        await ensureLoggedIn()
        const accountMid = currentAccount()
        const input = source.type === 'account' ? accountSourceInput(source.target) : subscription?.input
        if (!input) throw new Error(t('subs.sourceUnavailable'))
        const settings = getSettings()
        return subs.downloadSource({
          input, subscription, accountMid, defaults: normalizeOptions(settings.defaults, settings.defaultQn), choice,
          verifyAccount: () => {
            verify()
            requireAccount(accountMid)
          }
        })
      }
      return forAccount(subscription?.accountMid, run)
    }
    await ensureLoggedIn()
    const boundMid = subscription ? subscriptionAccount(subscription) : undefined
    const mid = source.type === 'account' ? source.mid : boundMid
    const verifyAccount = (): void => {
      if (mid !== undefined) requireAccount(mid)
    }
    verifyAccount()
    const input = source.type === 'account' ? accountSourceInput(source.target) : subscription?.input
    if (!input) throw new Error(t('subs.sourceUnavailable'))
    const settings = getSettings()
    return subs.downloadSource({
      input, subscription, defaults: normalizeOptions(settings.defaults, settings.defaultQn), verifyAccount, choice,
      accountMid: source.type === 'account' && source.target.type === 'watchlater' ? mid : boundMid
    })
  })

  handle('history:downloadedKeys', () => downloadedKeys())
  handle('history:clearDownloads', () => clearDownloads())
  handle('history:parses', () => parseRecords())
  handle('history:removeParse', (input: string, accountMid?: number | null) =>
    accountMid === undefined ? removeParse(input) : removeParse(input, accountMid))
  handle('history:clearParses', () => clearParses())

  handle('dl:enqueue', (req: EnqueueRequest, accountMid?: number) => {
    if (accounts) {
      const verify = verifyView()
      return forAccount(accountMid, async () => {
        await ensureLoggedIn()
        const mid = currentAccount()
        return enqueue({ ...req, accountMid: mid }, () => {
          verify()
          requireAccount(mid)
        })
      })
    }
    if (accountMid === undefined) return enqueue(req)
    requireAccount(accountMid)
    return enqueue(req, () => requireAccount(accountMid))
  })
  handle('dl:list', () => manager.list())
  handle('dl:pause', (id: string) => manager.pause(id))
  handle('dl:pauseMany', (ids: string[]) => manager.pauseMany(ids))
  handle('dl:pauseAll', () => manager.pauseAll())
  handle('dl:resume', (id: string) => manager.resume(id))
  handle('dl:resumeMany', (ids: string[]) => manager.resumeMany(ids))
  handle('dl:resumeAll', () => manager.resumeAll())
  handle('dl:remove', (ids: string[], deleteFiles: boolean) => manager.remove(ids, deleteFiles))
  handle('dl:retry', (id: string) => manager.resume(id))
  handle('dl:redownload', (id: string) => manager.redownload(id))
  handle('dl:clearFinished', (deleteFiles: boolean) => manager.clearFinished(deleteFiles))

  // 去水印只处理任务自己的成品文件，不接受界面传来的路径
  const videoTask = (id: string) => requireVideoTask(manager.list().find((t) => t.id === id))
  handle('wm:prepare', (id: string) => prepareManual(videoTask(id)))
  handle('wm:frame', (id: string, time: number, region?: WatermarkRegion) => previewFrame(videoTask(id), time, region))
  handle('wm:start', (id: string, region: WatermarkRegion, method?: WatermarkMethod) => {
    // 正式开始前先放掉预览占着的推理进程（显存、内存）
    if (method === 'ai') aiSessions().release(id)
    return manager.startWatermark(id, region, method === 'ai' ? 'ai' : 'fast')
  })
  handle('wm:cancel', (id: string) => manager.cancelWatermark(id))
  handle('wm:ai:status', () => aiModel().status())
  handle('wm:ai:download', () => {
    const s = getSettings()
    void aiModel().download({ threads: s.threads })
  })
  handle('wm:ai:cancel', () => aiModel().cancel())
  handle('wm:ai:remove', () => {
    aiSessions().closeAll()
    return aiModel().remove()
  })
  handle('wm:ai:estimate', (id: string, region: WatermarkRegion) => {
    const t = videoTask(id)
    return aiSessions().estimate(id, t.outputPath, region)
  })
  handle('wm:ai:preview', (id: string, time: number, region: WatermarkRegion) => {
    const t = videoTask(id)
    return aiSessions().preview(id, t.outputPath, time, region)
  })
  handle('wm:ai:release', (id: string) => aiSessions().release(id))
  handle('wm:speed', () => ({ fast: speedRatio('fast'), ai: speedRatio('ai') }))
  aiModel().on('status', (s) => send('wm:ai:status', s))

  handle('i18n:get', () => getLanguage())
  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: Partial<Settings>) => updateSettings(patch))
  handle('settings:chooseDir', async () => {
    const win = getMainWindow()
    const opts = {
      title: t('dialogs.chooseDownloadDir'),
      defaultPath: getSettings().downloadDir,
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled || !r.filePaths[0] ? getSettings() : updateSettings({ downloadDir: r.filePaths[0] })
  })

  handle('subs:list', () => subs.list())
  handle('subs:add', async (req: NewSubscription, accountMid?: number) => {
    if (accounts) return forAccount(accountMid, async () => {
      const verify = verifyView()
      await ensureLoggedIn()
      verify()
      return subs.add(req, currentAccount())
    })
    if (parseInput(req.input)?.type !== 'watchlater') return subs.add(req)
    await ensureLoggedIn()
    return subs.add(req, currentAccount())
  })
  handle('subs:update', (id: string, patch: Partial<Pick<Subscription, 'enabled' | 'intervalMin' | 'options'>>) =>
    subs.update(id, patch)
  )
  handle('subs:remove', (id: string) => subs.remove(id))
  handle('subs:check', (id: string) => subs.check(id))

  handle('net:status', () => networkStatus())
  handle('net:test', async () => {
    const t = Date.now()
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', { signal: AbortSignal.timeout(10_000) })
    await res.body?.cancel()
    return Date.now() - t
  })
  handle('net:cdnHosts', () => cdnHosts())
  handle('net:pingCdn', () => Promise.all(cdnHosts().map(async (h) => ({ host: h.host, ms: await pingHost(h.host) }))))

  handle('config:export', () => exportConfig(getMainWindow(), subs))
  handle('config:import', () => importConfig(getMainWindow(), subs))

  handle('mcp:status', () => mcp.status())
  handle('mcp:regenerateToken', () =>
    updateSettings({ mcp: { ...getSettings().mcp, token: randomBytes(24).toString('hex') } })
  )

  handle('app:close', (action: Exclude<CloseAction, 'ask'>, remember: boolean) => {
    if (remember) updateSettings({ closeAction: action })
    // 询问框里已经提醒过未完成的任务，不再二次确认
    if (action === 'quit') quitConfirmed()
    else hideMainWindow()
  })

  handle('update:state', () => updater.getState())
  handle('update:check', () => updater.check(true))
  handle('update:download', () => updater.download())
  handle('update:cancel', () => updater.cancel())
  handle('update:install', () => updater.install())
  handle('update:skip', () => updater.skip())
  handle('update:openPage', () => updater.openPage())

  handle('clipboard:read', () => clipboard.readText())
  handle('clipboard:write', (text: string) => clipboard.writeText(text))
  handle('shell:showInFolder', (path: string) => shell.showItemInFolder(path))
}
