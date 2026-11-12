import { t } from '@shared/i18n'
import type { BiliAccount, HistoryEntry, ParseRecord } from '@shared/types'
import type { accounts } from '../auth/accounts'
import type { downloadableQualities } from '../bili/playurl'
import { optionalInt, type Args } from './args'
import { describeError, invalid, ToolError } from './format'
import type { ToolDefinition } from './tools'

export type AccountRegistry = Pick<typeof accounts, 'run' | 'status' | 'partition' | 'midForPartition' | 'snapshot' | 'select' | 'remove'>
export type AccountFilter = number | null | undefined

export const accountInput = () => ({ type: 'integer', minimum: 1, description: t('mcpAccounts.useAccount') })
const filterInput = () => ({
  anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
  description: t('mcpAccounts.filterAccount')
})

export function accountMid(args: Args, required = false): number | undefined {
  if (args.account_mid === undefined && !required) return undefined
  const mid = optionalInt(args, 'account_mid', 1, Number.MAX_SAFE_INTEGER, 0)
  if (!mid) throw invalid(t('mcp.argMissing', { key: 'account_mid' }))
  return mid
}

export const accountFilter = (args: Args): AccountFilter => args.account_mid === null ? null : accountMid(args)
export const matchesAccount = (mid: number | undefined, filter: AccountFilter): boolean =>
  filter === undefined || (mid ?? null) === filter

export function findAccount(registry: AccountRegistry | undefined, mid: number): BiliAccount {
  const account = registry?.snapshot().accounts.find((a) => a.mid === mid)
  if (!account) throw new ToolError('NOT_FOUND', t('mcpAccounts.notFound', { mid }), 'list_accounts')
  return account
}

export function accountOut(account: BiliAccount) {
  return {
    account_mid: account.mid,
    name: account.uname,
    status: account.status,
    vip: account.vipActive,
    vip_label: account.vipLabel || undefined
  }
}

const networkTools = new Set(['parse_link', 'download_batch', 'search_videos', 'search_users', 'get_video_info', 'get_video_transcript', 'get_video_comments'])
const filteredTools = new Set(['get_batch_status', 'list_batches', 'list_tasks', 'control_tasks', 'remove_watermark'])

export const usesBiliAccount = (name: string): boolean => networkTools.has(name)

export function withAccountInput(def: ToolDefinition): ToolDefinition {
  const account_mid = usesBiliAccount(def.name) || def.name === 'get_status' ? accountInput()
    : filteredTools.has(def.name) ? filterInput() : undefined
  if (account_mid) return { ...def, inputSchema: { ...def.inputSchema, properties: { ...def.inputSchema.properties as object, account_mid } } }
  if (def.name === 'get_settings' || def.name === 'update_settings') return { ...def, description: `${def.description} ${t('mcpAccounts.sharedSettings')}` }
  return def
}

const queryFields = () => ({
  account_mid: filterInput(),
  offset: { type: 'integer', minimum: 0 },
  limit: { type: 'integer', minimum: 1, maximum: 500 }
})

export function accountDefinitions(): ToolDefinition[] {
  const readOnly = { readOnlyHint: true, openWorldHint: false }
  const changeAccount = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  return [
    {
      name: 'list_accounts', title: t('mcpAccounts.listTitle'), description: t('mcpAccounts.listDesc'),
      inputSchema: { type: 'object', properties: {} }, annotations: readOnly
    },
    {
      name: 'switch_account', title: t('mcpAccounts.switchTitle'), description: t('mcpAccounts.switchDesc'),
      inputSchema: { type: 'object', properties: { account_mid: accountInput() }, required: ['account_mid'] }, annotations: changeAccount
    },
    {
      name: 'logout_account', title: t('mcpAccounts.logoutTitle'), description: t('mcpAccounts.logoutDesc'),
      inputSchema: { type: 'object', properties: { account_mid: accountInput() }, required: ['account_mid'] },
      annotations: { ...changeAccount, destructiveHint: true }
    },
    {
      name: 'get_download_quality', title: t('mcpAccounts.qualityTitle'), description: t('mcpAccounts.qualityDesc'),
      inputSchema: {
        type: 'object', required: ['url'], properties: {
          url: { type: 'string' }, item_id: { type: 'string', description: t('mcpAccounts.qualityItem') },
          account_mid: { ...accountInput(), description: t('mcpAccounts.qualityAccount') }
        }
      },
      annotations: { ...readOnly, openWorldHint: true }
    },
    {
      name: 'list_download_history', title: t('mcpAccounts.downloadHistoryTitle'), description: t('mcpAccounts.downloadHistoryDesc'),
      inputSchema: { type: 'object', properties: queryFields() }, annotations: readOnly
    },
    {
      name: 'list_parse_history', title: t('mcpAccounts.parseHistoryTitle'), description: t('mcpAccounts.parseHistoryDesc'),
      inputSchema: { type: 'object', properties: queryFields() }, annotations: readOnly
    }
  ]
}

export function historyPage<T extends HistoryEntry | ParseRecord>(args: Args, records: T[], registry?: AccountRegistry) {
  const filter = accountFilter(args)
  const offset = optionalInt(args, 'offset', 0, Number.MAX_SAFE_INTEGER, 0)
  const limit = optionalInt(args, 'limit', 1, 500, 50)
  const entries = records.filter((e) => matchesAccount(e.accountMid, filter)).sort((a, b) => b.at - a.at)
  const names = new Map(registry?.snapshot().accounts.map((a) => [a.mid, a.uname]))
  return {
    total: entries.length,
    offset,
    next_offset: offset + limit < entries.length ? offset + limit : null,
    records: entries.slice(offset, offset + limit).map((e) => ({
      account_mid: e.accountMid ?? null,
      account_name: e.accountMid === undefined ? undefined : names.get(e.accountMid),
      title: e.title,
      at: new Date(e.at).toISOString(),
      ...('key' in e ? { item_id: e.key, group: e.groupTitle, path: e.path } : { input: e.input, kind: e.kind, count: e.count })
    }))
  }
}

export type QualityProbe = (url: string, itemId?: string) => Promise<{
  item_id: string
  title: string
  qualities: ReturnType<typeof downloadableQualities>
}>

export async function compareQuality(registry: AccountRegistry | undefined, probe: QualityProbe, url: string, itemId?: string, mid?: number) {
  const candidates = mid === undefined ? (registry?.snapshot().accounts ?? []).filter((a) => a.status !== 'removed') : [findAccount(registry, mid)]
  const results = []
  let rateLimit: ReturnType<typeof describeError> | undefined
  // 连续探测时只发一个账号的请求，避免同时打到 B 站的播放接口。
  for (const account of candidates) {
    const profile = accountOut(account)
    if (rateLimit) {
      results.push({ ...profile, error: rateLimit, best_quality: null })
      continue
    }
    try {
      const info = await registry!.run(account.mid, () => probe(url, itemId))
      results.push({ ...profile, ...info, status: registry!.status(account.mid), best_quality: info.qualities[0] ?? null })
    } catch (e) {
      const error = describeError(e)
      if (error.code === 'RATE_LIMITED') rateLimit = error
      if (error.code === 'NOT_LOGGED_IN') error.hint = t('mcpAccounts.relogin', { mid: account.mid })
      results.push({ ...profile, status: registry!.status(account.mid), error, best_quality: null })
    }
  }
  const comparable = new Set(results.flatMap((r) => 'item_id' in r ? [r.item_id] : [])).size <= 1
  const best = comparable ? Math.max(0, ...results.map((r) => r.best_quality?.qn ?? 0)) : 0
  return {
    accounts: results,
    best_qn: best || null,
    best_account_mids: best ? results.filter((r) => r.best_quality?.qn === best).map((r) => r.account_mid) : [],
    hint: comparable ? undefined : t('mcpAccounts.differentItems')
  }
}
