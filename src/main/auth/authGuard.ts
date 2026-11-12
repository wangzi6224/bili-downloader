import { t } from '@shared/i18n'
import type { AuthState } from '@shared/types'
import { BiliError, getRaw, LoginRequiredError, NAV_URL, setAuthExpiredHook, updateWbiKeys } from '../bili/http'
import { send } from '../windows'
import { clearBiliCookies, getCookie } from './session'
import { activeScope, authScope, inAuthScope, isRetired } from './scope'

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

interface SessionAuth {
  state: AuthState
  lastCheck: number
  lastRequired: number
  revision: number
  pending?: Promise<AuthState>
}

const sessions = new Map<string, SessionAuth>()
function sessionAuth(partition = authScope().partition): SessionAuth {
  let auth = sessions.get(partition)
  if (!auth) {
    auth = { state: { loggedIn: false }, lastCheck: 0, lastRequired: 0, revision: 0 }
    sessions.set(partition, auth)
  }
  return auth
}

const requiredListeners = new Set<() => void>()
const loginListeners = new Set<() => void>()
const loginChangeListeners = new Set<() => void>()
const sessionListeners = new Set<(partition: string, state: AuthState) => void>()

export const getAuthState = (): AuthState => sessionAuth().state
export const activeAuthState = (): AuthState => sessionAuth(activeScope().partition).state
export const authStateFor = (partition: string): AuthState | undefined => sessions.get(partition)?.state
export const forgetSessionAuth = (partition: string): void => {
  const auth = sessions.get(partition)
  if (auth) auth.revision++
  sessions.delete(partition)
}
export const onSessionAuthChanged = (fn: (partition: string, state: AuthState) => void): void => {
  sessionListeners.add(fn)
}

/** 有人检测到登录失效时回调（下载队列据此暂停取流） */
export function onAuthRequired(fn: () => void): void {
  requiredListeners.add(fn)
}

/** 从未登录变为已登录时回调 */
export function onLoggedIn(fn: () => void): void {
  loginListeners.add(fn)
}

/** 登录或退出登录时回调（托盘菜单据此切换“登录”和“退出登录”） */
export function onLoginChanged(fn: () => void): void {
  loginChangeListeners.add(fn)
}

function setState(next: AuthState): void {
  const { partition } = authScope()
  const auth = sessionAuth(partition)
  const wasLoggedIn = auth.state.loggedIn
  auth.state = next
  for (const fn of sessionListeners) fn(partition, next)
  if (partition !== activeScope().partition) return
  send('auth:changed', next)
  if (next.loggedIn === wasLoggedIn) return
  notifyLoginChange(next)
}

function notifyLoginChange(next: AuthState): void {
  for (const fn of loginChangeListeners) fn()
  if (next.loggedIn) for (const fn of loginListeners) fn()
}

export function publishActiveAuth(): void {
  const next = activeAuthState()
  send('auth:changed', next)
  notifyLoginChange(next)
}

/** 通知渲染进程弹出登录对话框（短时间内只弹一次） */
export function requireLogin(): void {
  const scope = authScope()
  if (isRetired(scope.partition)) return
  const auth = sessionAuth(scope.partition)
  auth.revision++
  auth.lastCheck = Date.now()
  if (auth.state.loggedIn || (scope.mid !== undefined && !auth.state.expired)) setState({ loggedIn: false, expired: true })
  if (scope.background || scope.partition !== activeScope().partition) return
  if (Date.now() - auth.lastRequired < 3000) return
  auth.lastRequired = Date.now()
  for (const fn of requiredListeners) fn()
  if (scope.mid === undefined) send('auth:required')
  else send('auth:required', { mode: 'reauth', mid: scope.mid, activate: false })
}

setAuthExpiredHook(requireLogin)

/** 调用 nav 接口确认登录状态；网络失败时保留原状态并抛错 */
export function checkAuth(): Promise<AuthState> {
  const auth = sessionAuth()
  if (auth.pending) return auth.pending
  const pending = inAuthScope(authScope(), readAuth).finally(() => {
    if (auth.pending === pending) auth.pending = undefined
  })
  auth.pending = pending
  return pending
}

async function readAuth(): Promise<AuthState> {
  const scope = authScope()
  const auth = sessionAuth(scope.partition)
  const revision = ++auth.revision
  const json = await getRaw<NavData>(NAV_URL)
  if (auth.revision !== revision) return auth.state
  if (scope.mid !== undefined && json.code !== 0 && json.code !== -101) {
    throw new BiliError(json.message, json.code)
  }
  updateWbiKeys(json.data?.wbi_img)
  const d = json.data
  if (json.code === 0 && d?.isLogin && (scope.mid === undefined || scope.mid === d.mid)) {
    auth.lastCheck = Date.now()
    setState({
      loggedIn: true,
      user: {
        mid: d.mid,
        uname: d.uname,
        face: d.face,
        vipActive: d.vipStatus === 1,
        vipLabel: d.vipStatus === 1 ? d.vip_label?.text || t('misc.vipDefault') : ''
      }
    })
  } else {
    const expired = scope.mid !== undefined || Boolean(await getCookie('SESSDATA'))
    if (auth.revision !== revision) return auth.state
    auth.lastCheck = Date.now()
    setState({ loggedIn: false, expired })
  }
  return auth.state
}

/** 距上次检查超过 minInterval 才真正请求 */
export async function checkAuthThrottled(minInterval: number): Promise<AuthState> {
  const { state, lastCheck } = sessionAuth()
  if (Date.now() - lastCheck < minInterval) return state
  return checkAuth()
}

/** 只清本地 cookie，不调用 B站退出接口——导入的 cookie 和浏览器共用同一个会话 */
export async function logout(): Promise<AuthState> {
  await clearBiliCookies()
  try {
    return await checkAuth()
  } catch {
    // 断网时确认不了状态，但 cookie 已经清掉，确实退出了
    setState({ loggedIn: false })
    return getAuthState()
  }
}

/** 需要登录的操作调用：未登录时弹出登录对话框并抛错 */
export async function ensureLoggedIn(): Promise<void> {
  const s = await checkAuthThrottled(60_000)
  if (!s.loggedIn) {
    requireLogin()
    throw new LoginRequiredError(t(s.expired ? 'authErr.loginExpired' : 'authErr.loginRequiredAccount'))
  }
}
