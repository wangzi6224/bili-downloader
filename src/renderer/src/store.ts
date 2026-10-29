import { create } from 'zustand'
import type { AuthState, ParseResult, Settings, TaskInfo, UpdateState } from '@shared/types'
import { platformText } from './platform'

export type View = 'downloads' | 'subs' | 'history' | 'settings'

interface State {
  /** null 表示还在检查 */
  auth: AuthState | null
  loginOpen: boolean
  /** 侧边栏当前选中的页面 */
  view: View
  /** 点了关闭按钮，询问退出还是后台运行 */
  closeAsk: boolean
  update: UpdateState | null
  /** 显示更新弹窗 */
  updateOpen: boolean
  settings: Settings | null
  tasks: TaskInfo[]
  parse: ParseResult | null
  parsing: boolean
  /** 批量解析、展开分P时的进度 */
  progress: { done: number; total: number; title?: string } | null
  error: string | null
  /** 不算错误的提示，例如“3 个视频已失效” */
  notice: string | null
  set: (patch: Partial<State>) => void
}

export const useStore = create<State>((set) => ({
  auth: null,
  loginOpen: false,
  view: 'downloads',
  closeAsk: false,
  update: null,
  updateOpen: false,
  settings: null,
  tasks: [],
  parse: null,
  parsing: false,
  progress: null,
  error: null,
  notice: null,
  set: (patch) => set(patch)
}))

export const api = window.api
/** 和系统有关的文案（访达 / 文件管理器、⌘ / Ctrl 等） */
export const sysText = platformText(api.platform)

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  try {
    useStore.getState().set({ settings: await api.settings.set(patch) })
  } catch (e) {
    useStore.getState().set({ error: (e as Error).message })
  }
}

async function runParse(fn: () => Promise<ParseResult>): Promise<void> {
  const { set } = useStore.getState()
  set({ parsing: true, error: null, notice: null, progress: null })
  try {
    const result = await fn()
    set({ parse: result })
    if (result.failures?.length) {
      set({ notice: `${result.failures.length} 个链接解析失败：${result.failures.map((f) => f.error).join('；')}` })
    }
  } catch (e) {
    set({ error: (e as Error).message })
  } finally {
    set({ parsing: false, progress: null })
  }
}

export const parseLink = (input: string): Promise<void> => runParse(() => api.parse(input))

export const parseBatch = (inputs: string[]): Promise<void> => runParse(() => api.parseBatch(inputs))
