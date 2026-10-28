import { create } from 'zustand'
import type { AuthState, ParseResult, Settings, TaskInfo } from '@shared/types'

interface State {
  /** null 表示还在检查 */
  auth: AuthState | null
  loginOpen: boolean
  settingsOpen: boolean
  settings: Settings | null
  tasks: TaskInfo[]
  parse: ParseResult | null
  parsing: boolean
  error: string | null
  set: (patch: Partial<State>) => void
}

export const useStore = create<State>((set) => ({
  auth: null,
  loginOpen: false,
  settingsOpen: false,
  settings: null,
  tasks: [],
  parse: null,
  parsing: false,
  error: null,
  set: (patch) => set(patch)
}))

export const api = window.api

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  useStore.getState().set({ settings: await api.settings.set(patch) })
}

export async function parseLink(input: string): Promise<void> {
  const { set } = useStore.getState()
  set({ parsing: true, error: null })
  try {
    set({ parse: await api.parse(input) })
  } catch (e) {
    set({ error: (e as Error).message })
  } finally {
    set({ parsing: false })
  }
}
