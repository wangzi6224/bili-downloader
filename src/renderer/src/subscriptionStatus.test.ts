import { describe, expect, it } from 'vitest'
import type { AccountState, BiliAccount } from '@shared/types'
import { pausedReason } from './subscriptionStatus'

const account = (mid: number, status: BiliAccount['status']): BiliAccount =>
  ({ mid, uname: `用户${mid}`, face: '', vipActive: false, vipLabel: '', status })
const state: AccountState = {
  activeMid: 1,
  accounts: [account(1, 'ready'), account(2, 'expired'), account(3, 'removed'), account(4, 'unchecked')],
  legacyCount: 0
}

describe('订阅暂停原因', () => {
  it('账号可用或还没确认时不提示', () => {
    expect(pausedReason(state, 1)).toBeUndefined()
    expect(pausedReason(state, 4)).toBeUndefined()
    expect(pausedReason(null, 2)).toBeUndefined()
  })

  it('账号失效、已退出、不在列表里或没有归属时说明暂停原因', () => {
    expect(pausedReason(state, 2)).toBe('accounts.subPausedExpired')
    expect(pausedReason(state, 3)).toBe('accounts.subPausedRemoved')
    expect(pausedReason(state, 99)).toBe('accounts.subPausedRemoved')
    expect(pausedReason(state, undefined)).toBe('accounts.subPausedNoAccount')
  })
})
