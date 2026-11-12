import { useState } from 'react'
import { LogOut, Plus, Settings } from 'lucide-react'
import type { BiliAccount, UserInfo } from '@shared/types'
import { useT } from '../i18n'
import { api, openLogin, useStore } from '../store'
import { Button, Group, IconButton, MenuItem, Row } from './ui'

export function useAccountActions() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const run = async (action: () => Promise<unknown>, done?: () => void): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      done?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const select = (account: BiliAccount, done?: () => void): Promise<void> =>
    run(() => api.auth.switchAccount(account.mid), done)

  const endSession = (account: UserInfo, signedIn: boolean, done?: () => void): void => {
    const message = signedIn
      ? `${t('accounts.logoutTitle', { name: account.uname })}\n\n${t('sidebar.logoutConfirm')}`
      : t('accounts.removeTitle', { name: account.uname })
    if (confirm(message)) void run(() => api.auth.removeAccount(account.mid), done)
  }

  return { busy, error, select, endSession, run }
}

export function QuickAccounts({ close, actions }: { close: () => void; actions: ReturnType<typeof useAccountActions> }) {
  const t = useT()
  const state = useStore((s) => s.accounts)
  const accounts = state?.accounts.filter((account) => account.status !== 'removed') ?? []
  return (
    <>
      {accounts.map((account) => (
        <div key={account.mid} className="flex items-center gap-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-50"
            disabled={actions.busy}
            aria-current={state?.activeMid === account.mid ? 'true' : undefined}
            onClick={() => {
              if (account.status === 'expired') {
                close()
                openLogin({ mode: 'reauth', mid: account.mid, activate: true })
              } else if (state?.activeMid === account.mid && account.status === 'ready') close()
              else void actions.select(account, close)
            }}
          >
            <span className="min-w-0 flex-1 truncate" title={account.uname}>{account.uname}</span>
            {account.status === 'expired' && <span className="shrink-0 text-xs text-muted">{t('sidebar.loginExpired')}</span>}
            {state?.activeMid === account.mid && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bili" />}
          </button>
          {account.status === 'ready' && (
            <IconButton
              icon={LogOut}
              label={t('accounts.logoutTitle', { name: account.uname })}
              size="sm"
              variant="danger"
              disabled={actions.busy}
              onClick={() => actions.endSession(account, true, close)}
            />
          )}
        </div>
      ))}
      <div className="my-1 border-t border-line" />
      <MenuItem icon={Plus} onClick={() => { close(); openLogin() }}>{t('accounts.add')}</MenuItem>
      <MenuItem icon={Settings} onClick={() => {
        close()
        useStore.getState().set({ view: 'settings', showAccountSettings: true })
      }}>{t('accounts.manage')}</MenuItem>
    </>
  )
}

export function AccountSettings() {
  const t = useT()
  const state = useStore((s) => s.accounts)
  const actions = useAccountActions()
  const accounts = state?.accounts.filter((account) => account.status !== 'removed') ?? []
  const active = accounts.find((account) => account.mid === state?.activeMid && account.status === 'ready')
  return (
    <Group title={t('accounts.manage')}>
      {accounts.map((account) => {
        const current = state?.activeMid === account.mid
        const expired = account.status === 'expired'
        const ready = account.status === 'ready'
        const hint = [
          `UID ${account.mid}`,
          current && t('accounts.current'),
          expired && t('sidebar.loginExpired')
        ].filter(Boolean).join(' · ')
        return (
          <Row key={account.mid} label={account.uname} hint={hint}>
            {expired ? (
              <Button disabled={actions.busy} onClick={() => openLogin({ mode: 'reauth', mid: account.mid, activate: current })}>
                {t('accounts.reauth')}
              </Button>
            ) : !current && (
              <Button disabled={actions.busy} onClick={() => void actions.select(account)}>{t('accounts.switch')}</Button>
            )}
            <Button
              variant="danger"
              disabled={actions.busy}
              onClick={() => actions.endSession(account, ready)}
            >
              {t(ready ? 'sidebar.logout' : 'accounts.remove')}
            </Button>
          </Row>
        )
      })}
      {active && !!state?.legacyCount && (
        <Row label={t('accounts.legacy')}>
          <Button disabled={actions.busy} onClick={() => {
            if (confirm(t('accounts.assignLegacy', { name: active.uname, count: state.legacyCount }))) {
              void actions.run(() => api.auth.assignLegacy(active.mid))
            }
          }}>{t('accounts.assignCurrent')}</Button>
        </Row>
      )}
      <Row label={t('sidebar.login')}>
        <Button icon={Plus} disabled={actions.busy} onClick={() => openLogin()}>{t('accounts.add')}</Button>
      </Row>
      {actions.error && <p role="alert" className="px-4 py-2 text-xs text-red-600 dark:text-red-400">{actions.error}</p>}
    </Group>
  )
}
