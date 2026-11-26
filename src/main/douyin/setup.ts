// 启动时装配抖音功能：页面桥、限速状态机、账号、解析服务，注册界面用的 dy:* 通道
import { join } from 'node:path'
import { Notification, session } from 'electron'
import { t } from '@shared/i18n'
import type { DySourceCategory, EnqueueRequest, MediaItem, Settings } from '@shared/types'
import { listBrowserProfiles, readBrowserCookies } from '../auth/browserImport'
import { setCookies } from '../auth/session'
import { resolveBatch } from '../bili/resolve'
import type { DownloadManager } from '../download/manager'
import { recordParse } from '../history'
import { handle } from '../ipc'
import { chromiumProxy } from '../net/network'
import { send, getMainWindow } from '../windows'
import { DyAccounts } from './accounts'
import { DouyinApi } from './api'
import { DouyinController } from './controller'
import { DY_SITE } from './cookies'
import { DouyinGate } from './gate'
import { openDyLoginWindow } from './login'
import { DouyinService, setDouyin, type DySource } from './service'
import { DouyinShare } from './share'
import { PageBridge } from './transport/page'
import { createDyWindow } from './transport/window'
import { dyUserAgent } from './ua'

export interface DouyinSetup {
  accounts: DyAccounts
  service: DouyinService
  api: DouyinApi
  gate: DouyinGate
  controller: DouyinController
  /** 关掉所有隐藏网页（主窗口关闭、退出应用时） */
  stop: () => void
}

export function setupDouyin(o: {
  userData: string
  settings: () => Settings
  manager: DownloadManager
  enqueue: (req: EnqueueRequest, beforeQueue?: () => void) => Promise<string | undefined>
  /** 点通知时打开主窗口 */
  showWindow: () => void
}): DouyinSetup {
  const userAgent = dyUserAgent()
  const accounts = new DyAccounts(join(o.userData, 'douyin'), {
    clearPartition: (partition) => session.fromPartition(partition).clearStorageData()
  })
  const transport = new PageBridge((account) => createDyWindow({ partition: accounts.partition(account), userAgent, proxy: chromiumProxy() }))
  // gate 的回调要等 controller 建好之后才会触发
  let controller: DouyinController | undefined
  const gate = new DouyinGate({ onChange: (account, snapshot) => controller?.gateChanged(account, snapshot) })
  const api = new DouyinApi(transport, gate)
  const service = new DouyinService({
    api,
    gate,
    share: new DouyinShare(),
    currentAccount: () => accounts.current(),
    identity: (id) => accounts.identity(id)
  })
  setDouyin(service)

  controller = new DouyinController({
    api,
    gate,
    transport,
    accounts,
    service,
    queue: o.manager,
    openLogin: (partition) => openDyLoginWindow({ partition, userAgent, proxy: chromiumProxy() }),
    writeCookies: (partition, cookies) => setCookies(session.fromPartition(partition), cookies),
    listBrowsers: (browserKey) => listBrowserProfiles(browserKey, DY_SITE),
    readBrowser: (profile) => readBrowserCookies(profile, DY_SITE),
    record: recordParse,
    onStatus: (status) => send('dy:statusChanged', status),
    onNeedsUser: () => {
      // 主窗口在前台时界面上已经有横幅
      if (!o.settings().notify || getMainWindow()?.isFocused() || !Notification.isSupported()) return
      const notification = new Notification({ title: t('common.appName'), body: t('dy.errVerify') })
      notification.on('click', o.showWindow)
      notification.show()
    }
  })
  accounts.on('changed', (snapshot) => send('dy:accountsChanged', snapshot))

  registerDouyinIpc({ controller, accounts, service, enqueue: o.enqueue })

  return { accounts, service, api, gate, controller, stop: () => transport.dispose() }
}

export interface DouyinIpcDeps {
  controller: DouyinController
  accounts: Pick<DyAccounts, 'snapshot' | 'select' | 'remove' | 'current'>
  service: Pick<DouyinService, 'loadPage' | 'streamInfo' | 'lists'>
  enqueue: (req: EnqueueRequest) => Promise<string | undefined>
}

/** 界面用的 dy:* 通道 */
export function registerDouyinIpc({ controller, accounts, service, enqueue }: DouyinIpcDeps): void {
  handle('dy:parse', (input: string) => controller.parseAndRecord(input))
  handle('dy:parseMore', (source: DySource, page: number) => service.loadPage(source, page))
  handle('dy:parseBatch', (inputs: string[]) =>
    resolveBatch(inputs, (done, total, title) => send('parse:progress', { done, total, title, site: 'douyin' }), (input) => controller.parseAndRecord(input)))
  handle('dy:streamInfo', (item: MediaItem) => service.streamInfo(item))
  handle('dy:enqueue', (req: EnqueueRequest) => enqueue({ ...req, dyAccount: accounts.current() }))
  handle('dy:accounts', () => accounts.snapshot())
  handle('dy:login', () => controller.login())
  handle('dy:listBrowsers', (browserKey?: string) => controller.listBrowsers(browserKey))
  handle('dy:importBrowser', (id: string) => controller.importBrowser(id))
  handle('dy:importCookie', (text: string) => controller.importCookie(text))
  handle('dy:selectAccount', (id?: string) => accounts.select(id))
  handle('dy:removeAccount', (id: string) => accounts.remove(id))
  handle('dy:checkAccount', (id: string) => controller.check(id))
  handle('dy:status', () => controller.status())
  handle('dy:verify', (account: string | null) => controller.verify(account))
  handle('dy:lists', (category: DySourceCategory, cursor: string) => service.lists(category, cursor))
}
