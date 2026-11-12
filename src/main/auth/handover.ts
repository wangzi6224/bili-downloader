import type { MessageBoxOptions } from 'electron'
import { t } from '@shared/i18n'
import type { AccountState, BiliAccount } from '@shared/types'

/** 退出账号时它名下没下完的任务和订阅：转给另一个账号、留着等重新登录、或者一起删除 */
export type HandoverPlan = 'transfer' | 'keep' | 'delete'

export interface HandoverDeps {
  accounts: { snapshot: () => AccountState; remove: (mid: number) => Promise<void> }
  tasks: { accountTasks: (mid: number) => string[]; transferAccount: (from: number, to: number) => void; remove: (ids: string[]) => void }
  subs: {
    accountSubscriptions: (mid: number) => { all: unknown[]; personal: unknown[] }
    transferAccount: (from: number, to: number) => void
    removeAccount: (mid: number) => void
  }
  batches: { transferAccount: (from: number, to: number) => void; cancelAccount: (mid: number) => void }
  dialog: (opts: MessageBoxOptions) => Promise<{ response: number }>
}

/** 发起方：用户本人在界面或托盘里点的，还是 AI 助手通过 MCP 请求的 */
export type Requester = 'user' | 'mcp'

/** 退出当前账号时应用会自动切到的那个账号，转移也交给它 */
function successor(state: AccountState, mid: number): BiliAccount | undefined {
  const usable = state.accounts.filter((a) => a.mid !== mid && (a.status === 'ready' || a.status === 'unchecked'))
  return usable.find((a) => a.mid === state.activeMid) ?? usable[0]
}

/**
 * 问过用户后退出账号，并按选择处理它名下的任务和订阅。
 * 返回 false 表示用户取消了；账号已经退出过的直接返回 true。
 */
export async function endAccount(deps: HandoverDeps, mid: number, requester: Requester): Promise<boolean> {
  const state = deps.accounts.snapshot()
  const account = state.accounts.find((a) => a.mid === mid)
  if (!account || account.status === 'removed') return true
  const signedIn = account.status === 'ready'
  const tasks = deps.tasks.accountTasks(mid).length
  const { all, personal } = deps.subs.accountSubscriptions(mid)
  const target = successor(state, mid)

  const message = requester === 'mcp'
    ? t('dialogs.mcpLogoutMessage', { name: account.uname })
    : t(signedIn ? 'accounts.logoutTitle' : 'accounts.removeTitle', { name: account.uname })
  const confirm = t(signedIn ? 'dialogs.logoutConfirm' : 'accounts.remove')
  let plans: (HandoverPlan | undefined)[]
  let buttons: string[]
  let detail: string
  if (!tasks && !all.length) {
    plans = ['keep', undefined]
    buttons = [confirm, t('dialogs.cancel')]
    detail = signedIn ? t('dialogs.logoutDetail') : ''
  } else {
    plans = [...(target ? ['transfer' as const] : []), 'keep', 'delete', undefined]
    buttons = [
      ...(target ? [t('accounts.handoverTransfer', { name: target.uname })] : []),
      t('accounts.handoverKeep'),
      t('accounts.handoverDelete'),
      t('dialogs.cancel')
    ]
    detail = [
      tasks ? t('accounts.handoverTasks', { count: tasks }) : '',
      all.length ? t('accounts.handoverSubs', { count: all.length }) : '',
      target && personal.length ? t('accounts.handoverPersonal', { count: personal.length }) : '',
      t('accounts.handoverAsk')
    ].filter(Boolean).join('\n')
  }
  const { response } = await deps.dialog({
    type: 'warning', message, detail, buttons, defaultId: buttons.length - 1, cancelId: buttons.length - 1, noLink: true
  })
  const plan = plans[response]
  if (!plan) return false

  await deps.accounts.remove(mid)
  if (plan === 'transfer' && target) {
    // 任务先转，批次按任务判断有没有结束
    deps.tasks.transferAccount(mid, target.mid)
    deps.batches.transferAccount(mid, target.mid)
    deps.subs.transferAccount(mid, target.mid)
  } else if (plan === 'delete') {
    deps.batches.cancelAccount(mid)
    const ids = deps.tasks.accountTasks(mid)
    if (ids.length) deps.tasks.remove(ids)
    deps.subs.removeAccount(mid)
  }
  return true
}
