// 启动时装配 YouTube：组件（yt-dlp）、账号、解析服务，注册界面用的 yt:* 通道
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { t } from '@shared/i18n'
import type { EnqueueRequest, MediaItem, ParseResult, Settings } from '@shared/types'
import { ImportError } from '../auth/importError'
import { listBrowserProfiles, readBrowserCookies } from '../auth/browserImport'
import { resolveBatch } from '../bili/resolve'
import type { DownloadManager } from '../download/manager'
import { ffmpegPath } from '../download/mux'
import { recordParse } from '../history'
import { handle } from '../ipc'
import { ytProxy } from '../net/network'
import { send } from '../windows'
import { YtAccounts, type Vault } from './accounts'
import { parseYtCookieText, YT_SITE } from './cookies'
import { YtEngine } from './engine'
import { setYoutube, YoutubeService } from './service'

const PLAIN = Buffer.from('plain:')

/** 用系统的安全存储加密；系统没有可用的（例如没装密钥环的 Linux）时退回明文，文件权限仍只有自己可读 */
export const systemVault = (): Vault => ({
  encrypt: (text) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.concat([PLAIN, Buffer.from(text)])),
  decrypt: (data) =>
    data.subarray(0, PLAIN.length).equals(PLAIN) ? data.subarray(PLAIN.length).toString('utf8') : safeStorage.decryptString(data)
})

export interface YoutubeSetup {
  engine: YtEngine
  accounts: YtAccounts
  service: YoutubeService
  /** 解析并记进解析记录（界面和 MCP 共用） */
  parseAndRecord: (input: string) => Promise<ParseResult>
  stop: () => void
}

export function setupYoutube(o: {
  userData: string
  settings: () => Settings
  manager: DownloadManager
  enqueue: (req: EnqueueRequest, beforeQueue?: () => void) => Promise<string | undefined>
}): YoutubeSetup {
  const cookieTmp = join(o.userData, 'tmp', 'yt-cookies')
  // 上次崩溃时没删掉的临时 cookie 文件：里面是登录凭据，不能留着
  rmSync(cookieTmp, { recursive: true, force: true })

  const engine = new YtEngine(join(o.userData, 'engines', 'yt-dlp'))
  const accounts = new YtAccounts(join(o.userData, 'youtube'), { vault: systemVault() })
  const service = new YoutubeService({
    useEngine: (fn) => engine.use(fn),
    env: async () => ({
      // 应用自己的可执行文件当 Node 用（ELECTRON_RUN_AS_NODE），不用另外下载 JS 运行时
      jsRuntime: process.execPath,
      ffmpeg: ffmpegPath(),
      proxy: await ytProxy(o.settings()).catch(() => ''),
      cacheDir: join(o.userData, 'yt-cache')
    }),
    cookies: (account) => accounts.cookieFile(account, cookieTmp),
    currentAccount: () => accounts.current(),
    onEngineError: () => void engine.checkUpdate(true).catch(() => undefined)
  })
  setYoutube(service)

  engine.on('status', (s) => send('yt:engine:status', s))
  accounts.on('changed', (s) => send('yt:accountsChanged', s))
  accounts.on('login', (id: string | undefined) => o.manager.ytLoginChanged(id))
  accounts.on('removed', (id: string) => o.manager.ytAccountRemoved(id))

  const parseAndRecord = async (input: string): Promise<ParseResult> => {
    const parsed = await service.parse(input)
    if (!parsed) throw new Error(t('yt.notYoutubeLink'))
    const result = { ...parsed, input: input.trim() }
    recordParse({
      input: input.trim(),
      title: result.title,
      kind: 'youtube',
      cover: result.cover,
      count: result.groups.reduce((n, g) => n + g.items.length, 0),
      at: Date.now()
    })
    return result
  }

  registerYoutubeIpc({ engine, accounts, service, parseAndRecord, enqueue: o.enqueue })

  // 启动后过一会儿检查一次更新，之后每 6 小时看一次（距上次检查不到一天的会跳过）
  const check = (): void => {
    if (o.settings().youtube.autoUpdate) void engine.checkUpdate().catch(() => undefined)
  }
  const first = setTimeout(check, 10_000)
  const timer = setInterval(check, 6 * 3600_000)
  return {
    engine,
    accounts,
    service,
    parseAndRecord,
    stop: () => {
      clearTimeout(first)
      clearInterval(timer)
      engine.cancel()
    }
  }
}

export interface YoutubeIpcDeps {
  engine: Pick<YtEngine, 'status' | 'ensure' | 'checkUpdate' | 'cancel'>
  accounts: Pick<YtAccounts, 'snapshot' | 'add' | 'select' | 'remove' | 'check' | 'current'>
  service: Pick<YoutubeService, 'loadPage' | 'streamInfo'>
  parseAndRecord: (input: string) => Promise<ParseResult>
  enqueue: (req: EnqueueRequest) => Promise<string | undefined>
}

/** 界面用的 yt:* 通道 */
export function registerYoutubeIpc({ engine, accounts, service, parseAndRecord, enqueue }: YoutubeIpcDeps): void {
  handle('yt:engine:status', () => engine.status())
  handle('yt:engine:prepare', async () => {
    await engine.ensure()
    return engine.status()
  })
  handle('yt:engine:check', () => engine.checkUpdate(true))
  handle('yt:engine:cancel', () => engine.cancel())
  handle('yt:parse', (input: string) => parseAndRecord(input))
  handle('yt:parseMore', (url: string, page: number) => service.loadPage(url, page))
  handle('yt:parseBatch', (inputs: string[]) =>
    resolveBatch(inputs, (done, total, title) => send('parse:progress', { done, total, title, site: 'youtube' }), parseAndRecord))
  handle('yt:streamInfo', (item: MediaItem) => service.streamInfo(item))
  handle('yt:enqueue', (req: EnqueueRequest) => enqueue({ ...req, ytAccount: accounts.current() }))
  handle('yt:accounts', () => accounts.snapshot())
  handle('yt:listBrowsers', (browserKey?: string) => listBrowserProfiles(browserKey, YT_SITE))
  handle('yt:importBrowser', async (id: string) => {
    try {
      return await accounts.add(await readBrowserCookies(id, YT_SITE))
    } catch (e) {
      if (e instanceof ImportError && e.code === 'no_login') throw new Error(t('ytLogin.noLoginInBrowser'))
      throw e
    }
  })
  handle('yt:importCookie', (text: string) => accounts.add(parseYtCookieText(text)))
  handle('yt:selectAccount', (id?: string) => accounts.select(id))
  handle('yt:removeAccount', (id: string) => accounts.remove(id))
  handle('yt:checkAccount', (id: string) => accounts.check(id))
}
