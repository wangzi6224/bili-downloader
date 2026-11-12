import type { Key } from '@shared/i18n'
import type { AccountState } from '@shared/types'

/** 订阅所属账号用不了时，主进程不再定时检查它，这里说明原因 */
export function pausedReason(accounts: AccountState | null, mid: number | undefined): Key | undefined {
  if (!accounts) return undefined
  if (mid === undefined) return 'accounts.subPausedNoAccount'
  const status = accounts.accounts.find((account) => account.mid === mid)?.status ?? 'removed'
  if (status === 'expired') return 'accounts.subPausedExpired'
  if (status === 'removed') return 'accounts.subPausedRemoved'
  return undefined
}
