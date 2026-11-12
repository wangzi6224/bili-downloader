import { AsyncLocalStorage } from 'node:async_hooks'

export const PARTITION = 'persist:bilibili'
export const GUEST_PARTITION = 'bilibili-guest'

export interface AuthScope {
  partition: string
  mid?: number
  background?: boolean
}

/** 一次操作捕获会话，切换界面账号时在途请求和重试仍用原会话。 */
const storage = new AsyncLocalStorage<AuthScope>()
let active: AuthScope = { partition: PARTITION }
let viewRevision = 0
const retired = new Set<string>()

export const activeScope = (): AuthScope => active
export const authScope = (): AuthScope => storage.getStore() ?? active
export const activeRevision = (): number => viewRevision
export const setActiveScope = (scope: AuthScope): void => {
  if (scope.partition !== active.partition) viewRevision++
  active = scope
}
export const inAuthScope = <T>(scope: AuthScope, fn: () => T): T => storage.run(scope, fn)
export const retirePartition = (partition: string): void => { retired.add(partition) }
export const isRetired = (partition: string): boolean => retired.has(partition)
