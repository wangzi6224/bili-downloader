// 抖音界面的逻辑（组件只负责显示，逻辑放在这里测）
import { extractDyInputs, parseDyInput } from '@shared/douyinUrl'
import { t } from '@shared/i18n'
import { KIND_TYPE_LABEL, renderTemplate, type NamingTemplates } from '@shared/naming'
import { DEFAULT_DY_OPTIONS, DY_ORIGINAL_QN } from '@shared/options'
import type {
  CodecPref,
  DownloadOptions,
  DyAccountsSnapshot,
  DyAccountState,
  DyOptions,
  MediaGroup,
  MediaItem,
  ParseResult,
  QualityOption,
  Settings
} from '@shared/types'

export type DyDownloadOptions = DownloadOptions & { dy: DyOptions }

/** 粘贴的内容：多个抖音链接批量解析，一个就直接解析（分享口令整段交给解析器） */
export function classifyDyPaste(text: string): { type: 'batch'; inputs: string[] } | { type: 'single' } | { type: 'none' } {
  const inputs = extractDyInputs(text)
  if (inputs.length > 1) return { type: 'batch', inputs }
  return parseDyInput(text) ? { type: 'single' } : { type: 'none' }
}

const option = (qn: number, label: string): QualityOption => ({ qn, label, needVip: false, needLogin: false, codecs: [] })

/** 画质选项：0 是最高。取到了作品的画质就用它的，否则给常见的几档 */
export function dyQualities(probed: QualityOption[] | undefined): QualityOption[] {
  const best = { ...option(0, ''), get label() { return t('ytUi.qualityBest') } }
  if (probed?.length) return [best, ...probed]
  return [best, option(1080, '1080p'), option(720, '720p'), option(540, '540p')]
}

/** 默认选中的画质：不超过设置里默认画质的最高一档；原画只有明确选了才用 */
export function dyDefaultQuality(qualities: QualityOption[], defaultQn: number): QualityOption {
  if (!defaultQn) return qualities[0]
  if (defaultQn >= DY_ORIGINAL_QN) return qualities.find((q) => q.qn >= DY_ORIGINAL_QN) ?? qualities[0]
  const sides = qualities.filter((q) => q.qn > 0 && q.qn < DY_ORIGINAL_QN)
  return sides.find((q) => q.qn <= defaultQn) ?? sides.at(-1) ?? qualities[0]
}

export function dyDefaultOptions(s: Settings): DyDownloadOptions {
  const { defaults, defaultQn } = s.douyin
  return { ...defaults, qn: defaultQn, dy: { ...DEFAULT_DY_OPTIONS, ...defaults.dy } }
}

export function currentDyAccount(s: DyAccountsSnapshot | null) {
  return s?.current ? s.accounts.find((a) => a.id === s.current) : undefined
}

export type DyNotice =
  | { type: 'verify'; account: string | null; text: string }
  | { type: 'expired'; text: string }
  | { type: 'cooling'; text: string }

/** 要显示的账号状态提示：要验证的最要紧，其次登录失效，再次限流 */
export function dyNotice(status: DyAccountState[], now: number): DyNotice | undefined {
  const verify = status.find((s) => s.state === 'verify')
  if (verify) return { type: 'verify', account: verify.account, text: t('dyUi.verifyNeeded') }
  if (status.some((s) => s.state === 'expired')) return { type: 'expired', text: t('dyUi.expiredBanner') }
  const cooling = status.find((s) => s.state === 'cooling' && (s.until ?? 0) > now)
  if (cooling) return { type: 'cooling', text: t('dyUi.cooling', { minutes: Math.max(1, Math.ceil((cooling.until! - now) / 60_000)) }) }
  return undefined
}

export interface DyPreviewInput {
  result: ParseResult
  groups: MediaGroup[]
  all: MediaItem[]
  selected: Set<string>
  naming: NamingTemplates
  opts: { output: DownloadOptions['output']; container: DownloadOptions['container']; codecOrder: CodecPref[] }
  chosen?: QualityOption
  now: number
}

/** 保存路径预览（相对抖音下载目录）：图文是一个文件夹，没有扩展名；没选中时为空 */
export function dyPathPreview({ result, groups, all, selected, naming, opts, chosen, now }: DyPreviewInput): string {
  const first = all.find((i) => selected.has(i.key))
  if (!first) return ''
  const group = groups.find((g) => g.items.includes(first))
  const src = result.batch && group?.source ? group.source : { title: result.title, kind: result.kind, meta: result.meta }
  const count = result.batch ? (group?.items.filter((i) => selected.has(i.key)).length ?? 0) : all.filter((i) => selected.has(i.key)).length
  const multi = count > 1
  const audio = opts.output === 'audio'
  const codec = opts.codecOrder.find((c) => !chosen?.codecs.length || chosen.codecs.includes(c)) ?? opts.codecOrder[0]
  const images = Boolean(first.images)
  const side = chosen && chosen.qn > 0 && chosen.qn < DY_ORIGINAL_QN ? `${chosen.qn}p` : ''
  const name = renderTemplate(multi ? naming.multi : naming.single, {
    title: first.title,
    series: multi || first.title !== src.title ? src.title : '',
    index: first.index,
    owner: first.owner ?? src.meta?.owner,
    pubdate: first.pubdate ?? src.meta?.pubdate,
    date: Math.floor(now / 1000),
    quality: audio || images ? '' : side,
    codec: audio || images ? '' : codec === 'hevc' ? 'HEVC' : 'AVC',
    id: first.dyId,
    type: KIND_TYPE_LABEL.douyin
  })
  return images ? `${name}/` : `${name}.${audio ? 'm4a' : opts.container}`
}
