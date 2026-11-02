import type { BrowserProfile } from '@shared/types'
import { optionalBool, optionalEnum, optionalInt, optionalString, type Args } from './args'
import { browserKey, rankProfiles, type LoginFlow, type LoginMethod, type LoginReason, type LoginSnapshot } from './loginFlow'
import type { ToolDefinition } from './tools'

const METHODS = ['browser', 'qr'] as const
const MAX_WAIT = 50
/** 不用钥匙串授权时导入几秒就完成，一次调用就能拿到结果 */
const DEFAULT_WAIT = 15

export const LOGIN_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'start_login',
    title: '登录 B站',
    description:
      '应用没有登录时用它登录。默认导入用户浏览器里的登录信息：按 Chrome、其他 Chrome 系、Opera、Firefox、Safari 的顺序，先用能直接读到的；Cookie 只保存在应用里，结果不包含它。' +
      '导入不成时按返回的 next 操作，next=try_qr 时告诉用户后用 method=qr 弹出扫码窗口，再用 get_login_status 带 wait_seconds 等登录完成。' +
      '已经登录时什么都不做，切换账号要用户在应用里操作。浏览器需要关闭时由应用弹窗问用户本人，这里没有直接关闭的参数。',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: METHODS, description: 'browser 从浏览器导入（默认）；qr 弹出登录窗口让用户扫码' },
        source: {
          type: 'string',
          description: '指定浏览器，如 chrome、edge、opera、firefox、safari，或 get_login_status 列出的配置档 id。不传时自动选择'
        },
        wait_seconds: {
          type: 'integer',
          minimum: 0,
          maximum: MAX_WAIT,
          description: `最多等待多少秒，默认 ${DEFAULT_WAIT}。登录完成、失败或需要用户操作时立即返回`
        }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'get_login_status',
    title: '查看登录进度',
    description:
      '查看 start_login 的进度。wait_seconds 大于 0 时会等到登录成功、失败或状态变化才返回：登录成功的那一刻立即返回，这就是扫码完成的通知，比反复查询省事。' +
      '用户在应用里自己登录也算。超时还是 waiting_user 就再调用一次。include_browsers=true 时列出本机浏览器和里面有没有 B站登录。',
    inputSchema: {
      type: 'object',
      properties: {
        wait_seconds: { type: 'integer', minimum: 0, maximum: MAX_WAIT, description: '最多等待多少秒，默认 0' },
        include_browsers: { type: 'boolean', description: '是否列出本机的浏览器，默认 false' }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }
]

type Next = 'wait' | 'tell_user' | 'try_qr' | 'none'

const FAILURES: Record<LoginReason, { next: Next; hint: string }> = {
  locked: { next: 'try_qr', hint: '浏览器正在运行。可以让用户完全退出浏览器（包括后台运行的）后再试，或改用扫码' },
  app_bound: { next: 'try_qr', hint: '这个浏览器用应用绑定加密保护登录信息，读不出来，请改用扫码' },
  blocked: { next: 'try_qr', hint: '没有权限读取这个浏览器的数据。macOS 上要在系统设置里给 B站下载器“完全磁盘访问权限”并重启应用，其他系统请检查文件夹权限，也可以改用扫码' },
  no_login: { next: 'try_qr', hint: '浏览器里没有 B站登录。用户刚在浏览器里登录的话，稍等半分钟再试（浏览器不是马上写入），或改用扫码' },
  expired: { next: 'try_qr', hint: '浏览器里的 B站登录已失效，请改用扫码，或让用户先在浏览器里重新登录' },
  keychain_denied: { next: 'try_qr', hint: '用户没有在钥匙串弹窗里点“允许”。问问用户是否要重试，或改用扫码' },
  network: { next: 'tell_user', hint: '连不上 B站，或被风控拦下了，等一会儿再试' },
  declined: { next: 'tell_user', hint: '用户不同意关闭浏览器，不要反复重试。问问用户是否要用 start_login method=qr 扫码' },
  confirm_timeout: { next: 'tell_user', hint: '用户没有回答对话框，可能没看到。提醒用户留意后再试，或改用扫码' },
  close_failed: { next: 'try_qr', hint: '浏览器没能关闭。可以让用户手动退出后再试，或改用扫码' },
  window_closed: { next: 'tell_user', hint: '用户关掉了登录窗口。问问用户是否要重新打开' },
  not_found: { next: 'try_qr', hint: '可以用 get_login_status include_browsers=true 查看本机的浏览器，或改用扫码' },
  failed: { next: 'try_qr', hint: '可以换一个浏览器，或改用扫码' }
}

const STEP_HINTS: Record<NonNullable<LoginSnapshot['step']>, string> = {
  checking: '正在确认登录状态。用 get_login_status wait_seconds=30 等结果',
  importing: '正在读取浏览器里的登录信息。macOS 可能弹出钥匙串授权，Linux 可能要解锁密钥环，请提醒用户点“允许”。用 get_login_status wait_seconds=30 等结果',
  confirm_close: '应用弹出了是否关闭浏览器的对话框，请提醒用户回答。用 get_login_status wait_seconds=30 等结果',
  closing_browser: '用户同意了，正在关闭浏览器。用 get_login_status wait_seconds=30 等结果',
  qr: '登录窗口已经打开，请告诉用户用 B站 App 扫码。用 get_login_status wait_seconds=50 等结果，登录成功时会立即返回，超时就再调用一次'
}

function nextStep(s: LoginSnapshot): { next: Next; hint?: string } {
  if (s.status === 'logged_in' || s.status === 'idle') return { next: 'none' }
  if (s.status === 'failed') return FAILURES[s.reason!]
  return { next: s.status === 'in_progress' ? 'wait' : 'tell_user', hint: STEP_HINTS[s.step!] }
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
  app_bound: p.appBound || undefined
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
      ...(batches.length ? { hint: '这些批次之前被打断了，用 control_tasks action=resume batch_id=… 继续' } : {})
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
