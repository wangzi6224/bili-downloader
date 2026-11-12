import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type { AccountState, BiliAccount } from '@shared/types'
import { endAccount, type HandoverDeps } from './handover'

const account = (mid: number, status: BiliAccount['status']): BiliAccount =>
  ({ mid, uname: `账号${mid}`, face: '', vipActive: false, vipLabel: '', status })

let state: AccountState
let tasks: string[]
let subs: { all: unknown[]; personal: unknown[] }
let response: number
const remove = vi.fn<(mid: number) => Promise<void>>()
const accountTasks = vi.fn<(mid: number) => string[]>()
const transferTasks = vi.fn<(from: number, to: number) => void>()
const removeTasks = vi.fn<(ids: string[]) => void>()
const transferSubs = vi.fn<(from: number, to: number) => void>()
const removeSubs = vi.fn<(mid: number) => void>()
const transferBatches = vi.fn<(from: number, to: number) => void>()
const cancelBatches = vi.fn<(mid: number) => void>()
const showDialog = vi.fn<HandoverDeps['dialog']>()
const deps: HandoverDeps = {
  accounts: { snapshot: () => state, remove },
  tasks: { accountTasks, transferAccount: transferTasks, remove: removeTasks },
  subs: { accountSubscriptions: () => subs, transferAccount: transferSubs, removeAccount: removeSubs },
  batches: { transferAccount: transferBatches, cancelAccount: cancelBatches },
  dialog: showDialog
}

beforeEach(() => {
  vi.clearAllMocks()
  state = { activeMid: 1, accounts: [account(1, 'ready'), account(2, 'ready'), account(3, 'expired')], legacyCount: 0 }
  tasks = ['t1', 't2']
  subs = { all: [{}, {}, {}], personal: [{}] }
  response = 0
  remove.mockResolvedValue()
  accountTasks.mockImplementation(() => tasks)
  showDialog.mockImplementation(async () => ({ response, checkboxChecked: false }))
})

const dialog = () => showDialog.mock.calls[0][0] as { message: string; detail: string; buttons: string[]; cancelId: number }

describe('退出账号时处理它名下的任务和订阅', () => {
  it('没有任务和订阅时只问要不要退出', async () => {
    tasks = []
    subs = { all: [], personal: [] }
    expect(await endAccount(deps, 2, 'user')).toBe(true)
    expect(dialog().buttons).toEqual([t('dialogs.logoutConfirm'), t('dialogs.cancel')])
    expect(dialog().detail).toBe(t('dialogs.logoutDetail'))
    expect(remove).toHaveBeenCalledWith(2)
    expect(transferTasks).not.toHaveBeenCalled()
    expect(removeTasks).not.toHaveBeenCalled()
  })

  it('转给当前账号：先退出，再转任务、批次和订阅，并说明稍后再看不会转', async () => {
    expect(await endAccount(deps, 2, 'user')).toBe(true)
    expect(dialog().message).toBe(t('accounts.logoutTitle', { name: '账号2' }))
    expect(dialog().buttons).toEqual([
      t('accounts.handoverTransfer', { name: '账号1' }), t('accounts.handoverKeep'), t('accounts.handoverDelete'), t('dialogs.cancel')
    ])
    expect(dialog().cancelId).toBe(3)
    expect(dialog().detail).toContain(t('accounts.handoverTasks', { count: 2 }))
    expect(dialog().detail).toContain(t('accounts.handoverSubs', { count: 3 }))
    expect(dialog().detail).toContain(t('accounts.handoverPersonal', { count: 1 }))
    expect(remove).toHaveBeenCalledWith(2)
    expect(transferTasks).toHaveBeenCalledWith(2, 1)
    expect(transferBatches).toHaveBeenCalledWith(2, 1)
    expect(transferSubs).toHaveBeenCalledWith(2, 1)
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(transferTasks.mock.invocationCallOrder[0])
  })

  it('退出当前账号时转给应用会自动切到的账号，过期账号不算', async () => {
    state = { activeMid: 1, accounts: [account(1, 'ready'), account(3, 'expired'), account(4, 'unchecked')], legacyCount: 0 }
    await endAccount(deps, 1, 'user')
    expect(dialog().buttons[0]).toBe(t('accounts.handoverTransfer', { name: '账号4' }))
    expect(transferTasks).toHaveBeenCalledWith(1, 4)
  })

  it('保留：只退出，任务和订阅留着等重新登录', async () => {
    response = 1
    expect(await endAccount(deps, 2, 'user')).toBe(true)
    expect(remove).toHaveBeenCalledWith(2)
    expect(transferTasks).not.toHaveBeenCalled()
    expect(removeTasks).not.toHaveBeenCalled()
    expect(removeSubs).not.toHaveBeenCalled()
  })

  it('一起删除：取消批次里没处理的条目，删掉没下完的任务和订阅', async () => {
    response = 2
    expect(await endAccount(deps, 2, 'user')).toBe(true)
    expect(cancelBatches).toHaveBeenCalledWith(2)
    expect(removeTasks).toHaveBeenCalledWith(['t1', 't2'])
    expect(removeSubs).toHaveBeenCalledWith(2)
  })

  it('取消时什么都不做', async () => {
    response = 3
    expect(await endAccount(deps, 2, 'user')).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })

  it('没有别的账号可转时不给转移选项；过期账号显示为移除', async () => {
    state = { activeMid: undefined, accounts: [account(3, 'expired')], legacyCount: 0 }
    response = 1
    expect(await endAccount(deps, 3, 'user')).toBe(true)
    expect(dialog().message).toBe(t('accounts.removeTitle', { name: '账号3' }))
    expect(dialog().buttons).toEqual([t('accounts.handoverKeep'), t('accounts.handoverDelete'), t('dialogs.cancel')])
    expect(dialog().detail).not.toContain(t('accounts.handoverPersonal', { count: 1 }))
    expect(removeTasks).toHaveBeenCalled()
  })

  it('AI 助手请求退出时用对应的提示；已经退出过的账号不再询问', async () => {
    tasks = []
    subs = { all: [], personal: [] }
    await endAccount(deps, 2, 'mcp')
    expect(dialog().message).toBe(t('dialogs.mcpLogoutMessage', { name: '账号2' }))
    showDialog.mockClear()
    state.accounts.push(account(5, 'removed'))
    expect(await endAccount(deps, 5, 'mcp')).toBe(true)
    expect(await endAccount(deps, 42, 'mcp')).toBe(true)
    expect(showDialog).not.toHaveBeenCalled()
  })
})
