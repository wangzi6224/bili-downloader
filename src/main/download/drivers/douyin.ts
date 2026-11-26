// 抖音的下载驱动：取作品数据、选流、直链下载；图文作品交给队列整个放进一个目录
import { closeSync, openSync, readSync, rmSync } from 'node:fs'
import { dyVideoUrl } from '@shared/douyinUrl'
import type { TaskInfo } from '@shared/types'
import { UnsupportedError } from '../../bili/http'
import { prepareDyExtras, sniffName } from '../../douyin/extras'
import { pickDouyin } from '../../douyin/pick'
import type { DouyinService } from '../../douyin/service'
import { MOBILE_UA } from '../../douyin/share'
import type { DyAweme } from '../../douyin/types'
import { dyHeaders } from '../../douyin/ua'
import { AbortError } from '../errors'
import { fetchParts } from './direct'
import type { Acquired, PlatformDriver } from './types'

/** 图文一次下几张 */
const IMAGE_CONCURRENCY = 3

const account = (t: TaskInfo): string | null => t.dyAccount ?? null

/** 文件开头几个字节，用来认格式 */
function headOf(path: string): Buffer {
  const head = Buffer.alloc(12)
  const fd = openSync(path, 'r')
  try {
    readSync(fd, head, 0, head.length, 0)
  } finally {
    closeSync(fd)
  }
  return head
}

export function createDouyinDriver(dy: () => DouyinService): PlatformDriver {
  /** acquire 取到的作品数据留给 extras */
  const runs = new Map<string, DyAweme>()

  return {
    hold: (t) => dy().hold(account(t)),

    async acquire(t, ctx): Promise<Acquired> {
      const id = t.item.dyId
      if (!id || t.item.unavailable) throw new UnsupportedError(t.item.unavailable ?? t.title)
      const aweme = await dy().aweme(id, { account: account(t), signal: ctx.signal, background: true, fresh: Boolean(t.retries) })
      if (ctx.signal.aborted) throw new AbortError()
      const pick = pickDouyin(aweme, t.options, t.dyFormat)
      // 画质档变了（上次的这次没有了），下了一半的不能接着用
      if (t.dyFormat && t.dyFormat !== pick.spec) rmSync(ctx.tmp, { recursive: true, force: true })
      ctx.onPlanned({ qualityLabel: pick.qualityLabel, videoQn: pick.type === 'av' ? pick.height : undefined, lock: pick.spec })
      const paths = await fetchParts(pick.parts, ctx, {
        headers: dyHeaders(aweme.fromShare ? MOBILE_UA : undefined),
        concurrency: pick.type === 'files' ? IMAGE_CONCURRENCY : undefined,
        singleFallback: true
      })
      if (pick.type === 'files') {
        return {
          files: paths.map((path, i) => ({ path, name: sniffName(pick.parts[i].name, headOf(path)) })),
          qualityLabel: pick.qualityLabel,
          quality: pick.quality,
          codec: '',
          notes: pick.notes
        }
      }
      runs.set(t.id, aweme)
      return {
        video: pick.video === undefined ? undefined : paths[pick.video],
        audio: pick.audio === undefined ? undefined : paths[pick.audio],
        muxed: pick.muxed,
        format: pick.format,
        qualityLabel: pick.qualityLabel,
        quality: pick.quality,
        codec: pick.codec,
        notes: pick.notes,
        hevc: pick.hevc,
        dolbyVision: false
      }
    },

    async extras(t, ctx) {
      const aweme = runs.get(t.id)
      runs.delete(t.id)
      if (!aweme) return { subtitles: [], notes: [] }
      return prepareDyExtras(t, aweme, ctx.tmp, ctx.settings(), ctx.signal, {
        danmaku: (start, duration) => dy().danmaku(aweme.aweme_id, start, duration, { account: account(t), signal: ctx.signal, background: true })
      })
    },

    sourceUrl: (t) => (t.item.dyId ? dyVideoUrl(t.item.dyId) : t.meta?.url)
  }
}
