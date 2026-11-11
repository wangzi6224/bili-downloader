import { t, type Key } from '@shared/i18n'
import type { BrowserProfile } from '@shared/types'
import { optionalBool, optionalEnum, optionalInt, optionalString, type Args } from './args'
import { browserKey, rankProfiles, type LoginFlow, type LoginMethod, type LoginReason, type LoginSnapshot } from './loginFlow'
import type { ToolDefinition } from './tools'

const METHODS = ['browser', 'qr'] as const
const MAX_WAIT = 50
/** 不用钥匙串授权时导入几秒就完成，一次调用就能拿到结果 */
const DEFAULT_WAIT = 15

/** 登录工具的定义。按当前语言现算，每次 tools/list 时调用 */
export const loginDefinitions = (): ToolDefinition[] => [
  {
    name: 'start_login',
    title: t('mcpLogin.startTitle'),
    description: t('mcpLogin.startDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: METHODS, description: t('mcpLogin.startMethod') },
        source: { type: 'string', description: t('mcpLogin.startSource') },
        wait_seconds: {
          type: 'integer',
          minimum: 0,
          maximum: MAX_WAIT,
          description: t('mcpLogin.startWait', { n: DEFAULT_WAIT })
        }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'get_login_status',
    title: t('mcpLogin.statusTitle'),
    description: t('mcpLogin.statusDesc'),
    inputSchema: {
      type: 'object',
      properties: {
        wait_seconds: { type: 'integer', minimum: 0, maximum: MAX_WAIT, description: t('mcpLogin.statusWait') },
        include_browsers: { type: 'boolean', description: t('mcpLogin.statusBrowsers') }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }
]

type Next = 'wait' | 'tell_user' | 'try_qr' | 'none'

const FAILURES: Record<LoginReason, { next: Next; hint: Key }> = {
  locked: { next: 'try_qr', hint: 'mcpLogin.hintLocked' },
  app_bound: { next: 'try_qr', hint: 'mcpLogin.hintAppBound' },
  blocked: { next: 'try_qr', hint: 'mcpLogin.hintBlocked' },
  no_login: { next: 'try_qr', hint: 'mcpLogin.hintNoLogin' },
  expired: { next: 'try_qr', hint: 'mcpLogin.hintExpired' },
  keychain_denied: { next: 'try_qr', hint: 'mcpLogin.hintKeychainDenied' },
  network: { next: 'tell_user', hint: 'mcpLogin.hintNetwork' },
  declined: { next: 'tell_user', hint: 'mcpLogin.hintDeclined' },
  confirm_timeout: { next: 'tell_user', hint: 'mcpLogin.hintConfirmTimeout' },
  close_failed: { next: 'try_qr', hint: 'mcpLogin.hintCloseFailed' },
  window_closed: { next: 'tell_user', hint: 'mcpLogin.hintWindowClosed' },
  not_found: { next: 'try_qr', hint: 'mcpLogin.hintNotFound' },
  failed: { next: 'try_qr', hint: 'mcpLogin.hintFailed' }
}

const STEP_HINTS: Record<NonNullable<LoginSnapshot['step']>, Key> = {
  checking: 'mcpLogin.stepChecking',
  importing: 'mcpLogin.stepImporting',
  confirm_close: 'mcpLogin.stepConfirmClose',
  closing_browser: 'mcpLogin.stepClosingBrowser',
  qr: 'mcpLogin.stepQr'
}

function nextStep(s: LoginSnapshot): { next: Next; hint?: string } {
  if (s.status === 'logged_in' || s.status === 'idle') return { next: 'none' }
  if (s.status === 'failed') {
    const f = FAILURES[s.reason!]
    return { next: f.next, hint: t(f.hint, { appName: t('common.appName') }) }
  }
  return { next: s.status === 'in_progress' ? 'wait' : 'tell_user', hint: t(STEP_HINTS[s.step!]) }
}

/** 读不到的配置档不能说成“没有登录”，所以 has_login 是 null */
const browserOut = (p: BrowserProfile) => ({
  id: p.id,
  key: browserKey(p),
  browser: p.browser,
  profile: p.profile,
  has_login: p.locked || p.blocked ? null : p.hasBiliLogin,
  locked: p.locked || undefined,
  blocked: p.blocked || undefined,
  app_bound: p.appBound || p.appBoundLogin || undefined
})

/** 登录工具：把 LoginFlow 的状态整理成 agent 好用的 JSON */
export class LoginTools {
  private handlers: Record<string, (args: Args) => Promise<Record<string, unknown>>> = {
    start_login: (a) => this.start(a),
    get_login_status: (a) => this.status(a)
  }

  constructor(
    private flow: LoginFlow,
    private interruptedBatches: () => string[]
  ) {}

  handles(name: string): boolean {
    return Object.hasOwn(this.handlers, name)
  }

  call(name: string, args: Args): Promise<Record<string, unknown>> {
    return this.handlers[name](args)
  }

  private out(s: LoginSnapshot): Record<string, unknown> {
    const user = s.auth.loggedIn ? s.auth.user : undefined
    const batches = user ? this.interruptedBatches() : []
    return {
      status: s.status,
      logged_in: Boolean(user),
      user: user?.uname,
      vip: user?.vipActive,
      vip_label: user?.vipLabel || undefined,
      step: s.step,
      reason: s.reason,
      message: s.message,
      source: s.source,
      tried: s.tried.length ? s.tried : undefined,
      // 导入的账号不对时，用户要在应用里换成这些配置档
      also_available: s.alsoAvailable.length ? s.alsoAvailable : undefined,
      interrupted_batches: batches.length ? batches : undefined,
      ...nextStep(s),
      ...(batches.length ? { hint: t('mcpLogin.interrupted') } : {})
    }
  }

  private async start(args: Args) {
    const method = optionalEnum<LoginMethod>(args, 'method', METHODS, 'browser')
    const source = optionalString(args, 'source')
    const wait = optionalInt(args, 'wait_seconds', 0, MAX_WAIT, DEFAULT_WAIT)
    this.flow.start(method, source)
    // 已经在等用户时不用再等：agent 要先去提醒用户
    if (this.flow.snapshot().status === 'in_progress') await this.flow.wait(wait * 1000)
    return this.out(this.flow.snapshot())
  }

  private async status(args: Args) {
    const wait = optionalInt(args, 'wait_seconds', 0, MAX_WAIT, 0)
    const browsers = optionalBool(args, 'include_browsers', false)
    await this.flow.wait(wait * 1000)
    return {
      ...this.out(this.flow.snapshot()),
      browsers: browsers ? rankProfiles(this.flow.browsers()).map(browserOut) : undefined
    }
  }
}
