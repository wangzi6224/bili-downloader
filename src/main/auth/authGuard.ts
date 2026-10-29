import type { AuthState } from '@shared/types'
import { getRaw, LoginRequiredError, NAV_URL, setAuthExpiredHook, updateWbiKeys } from '../bili/http'
import { send } from '../windows'
import { getCookie } from './session'

interface NavData {
  isLogin: boolean
  mid: number
  uname: string
  face: string
  vipStatus: number
  vipType: number
  vip_label?: { text?: string }
  wbi_img: { img_url: string; sub_url: string }
}

let state: AuthState = { loggedIn: false }
let lastCheck = 0
let lastRequired = 0
const requiredListeners = new Set<() => void>()
const loginListeners = new Set<() => void>()

export const getAuthState = (): AuthState => state

/** 有人检测到登录失效时回调（下载队列据此暂停取流） */
export function onAuthRequired(fn: () => void): void {
  requiredListeners.add(fn)
}

/** 从未登录变为已登录时回调 */
export function onLoggedIn(fn: () => void): void {
  loginListeners.add(fn)
}

function setState(next: AuthState): void {
  const wasLoggedIn = state.loggedIn
  state = next
  send('auth:changed', next)
  if (next.loggedIn && !wasLoggedIn) for (const fn of loginListeners) fn()
}

/** 通知渲染进程弹出登录对话框（短时间内只弹一次） */
export function requireLogin(): void {
  if (state.loggedIn) setState({ loggedIn: false, expired: true })
  if (Date.now() - lastRequired < 3000) return
  lastRequired = Date.now()
  for (const fn of requiredListeners) fn()
  send('auth:required')
}

setAuthExpiredHook(requireLogin)

/** 调用 nav 接口确认登录状态；网络失败时保留原状态并抛错 */
export async function checkAuth(): Promise<AuthState> {
  const json = await getRaw<NavData>(NAV_URL)
  lastCheck = Date.now()
  updateWbiKeys(json.data?.wbi_img)
  const d = json.data
  if (json.code === 0 && d?.isLogin) {
    setState({
      loggedIn: true,
      user: {
        mid: d.mid,
        uname: d.uname,
        face: d.face,
        vipActive: d.vipStatus === 1,
        vipLabel: d.vipStatus === 1 ? d.vip_label?.text || '大会员' : ''
      }
    })
  } else {
    // 有 SESSDATA 却未登录，说明 cookie 已过期
    setState({ loggedIn: false, expired: Boolean(await getCookie('SESSDATA')) })
  }
  return state
}

/** 距上次检查超过 minInterval 才真正请求 */
export async function checkAuthThrottled(minInterval: number): Promise<AuthState> {
  if (Date.now() - lastCheck < minInterval) return state
  return checkAuth()
}

/** 需要登录的操作调用：未登录时弹出登录对话框并抛错 */
export async function ensureLoggedIn(): Promise<void> {
  const s = await checkAuthThrottled(60_000)
  if (!s.loggedIn) {
    requireLogin()
    throw new LoginRequiredError(s.expired ? '登录已过期，请重新登录' : '请先登录 B站账号')
  }
}
