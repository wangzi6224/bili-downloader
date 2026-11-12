import { useT } from '../i18n'
import { useStore } from '../store'

export function AccountOrigin({ mid }: { mid?: number }) {
  const t = useT()
  const name = useStore((s) => s.accounts?.accounts.find((account) => account.mid === mid)?.uname)
  const text = mid === undefined ? t('accounts.originUnknown') : t('accounts.origin', { name: name ?? `UID ${mid}` })
  return <span className="truncate" title={text}>{text}</span>
}
