// YouTube：每次运行都重新取一次视频信息（流地址会过期），选好格式后交给 yt-dlp 分别下载画面和声音，合并仍由下载队列做
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ytWatchUrl } from '@shared/site'
import type { TaskInfo } from '@shared/types'
import { UnsupportedError } from '../../bili/http'
import { AbortError } from '../errors'
import { pickYtFormats } from '../../youtube/pick'
import { prepareYtExtras } from '../../youtube/extras'
import { parseProgress, PROGRESS_ARGS } from '../../youtube/run'
import type { YoutubeService } from '../../youtube/service'
import type { YtFormat, YtVideoInfo } from '../../youtube/types'
import type { Acquired, PlatformDriver } from './types'

/** 估算大小：有的格式只给码率 */
const estimate = (f: YtFormat, duration: number): number =>
  f.filesize ?? f.filesize_approx ?? Math.round(((f.tbr ?? f.abr ?? 0) * 1000 * duration) / 8)

/** yt-dlp 存下的文件：一般是 format_id.ext，修复容器后扩展名可能变 */
function fileOf(tmp: string, f: YtFormat): string {
  const exact = join(tmp, `${f.format_id}.${f.ext}`)
  if (existsSync(exact)) return exact
  const other = readdirSync(tmp).find((n) => n.startsWith(`${f.format_id}.`) && !/\.(part|ytdl|json)$/.test(n))
  return other ? join(tmp, other) : exact
}

export function createYoutubeDriver(yt: () => YoutubeService): PlatformDriver {
  /** acquire 到 extras 之间要用的：本次运行取到的视频信息 */
  const runs = new Map<string, { info: YtVideoInfo; infoPath: string }>()
  // 任务的账号；没绑账号的不登录（不是“当前账号”：下载期间用户可能切换了账号）
  const account = (t: TaskInfo): string | null => t.ytAccount ?? null

  return {
    async acquire(t, ctx): Promise<Acquired> {
      const id = t.item.ytId
      if (!id || t.item.unavailable) throw new UnsupportedError(t.item.unavailable ?? t.title)
      const info = await yt().info(ytWatchUrl(id), { account: account(t), signal: ctx.signal, fresh: Boolean(t.retries) })
      if (ctx.signal.aborted) throw new AbortError()
      const pick = pickYtFormats(info, t.options, t.ytFormat)
      // 格式变了（例如上次的格式这次没有了），之前下了一半的不能接着用
      if (t.ytFormat && t.ytFormat !== pick.spec) rmSync(ctx.tmp, { recursive: true, force: true })
      ctx.onPlanned({ qualityLabel: pick.qualityLabel, videoQn: pick.height, lock: pick.spec })
      mkdirSync(ctx.tmp, { recursive: true })
      const infoPath = join(ctx.tmp, 'info.json')
      writeFileSync(infoPath, JSON.stringify(info))
      runs.set(t.id, { info, infoPath })

      const parts = [pick.video, pick.audio].filter((f): f is YtFormat => Boolean(f))
      const duration = info.duration ?? t.item.duration ?? 0
      const sizes = parts.map((f) => estimate(f, duration))
      const done = parts.map(() => 0)
      const report = (): void => ctx.onProgress(done.reduce((a, b) => a + b, 0), sizes.reduce((a, b) => a + b, 0))
      report()
      const s = ctx.settings()
      // yt-dlp 每个进程单独限速：全局限速平均分给同时下载的 YouTube 任务（近似）
      const share = s.speedLimit > 0 ? Math.max(1, Math.floor(s.speedLimit / Math.max(1, Math.min(s.concurrency, s.youtube.concurrency)))) : 0
      await yt().exec([
        '--load-info-json', infoPath,
        '-f', pick.spec,
        '-P', ctx.tmp,
        '-o', '%(format_id)s.%(ext)s',
        '--concurrent-fragments', String(s.threads),
        '--no-mtime',
        ...(share ? ['--limit-rate', `${share}K`] : []),
        ...PROGRESS_ARGS
      ], {
        account: account(t),
        signal: ctx.signal,
        onLine: (line) => {
          const p = parseProgress(line)
          if (!p?.filename) return
          const name = p.filename.replace(/^.*[\\/]/, '')
          const i = parts.findIndex((f) => name.startsWith(`${f.format_id}.`))
          if (i < 0) return
          if (p.total) sizes[i] = p.total
          done[i] = p.status === 'finished' ? sizes[i] : p.downloaded
          report()
        }
      })
      for (let i = 0; i < parts.length; i++) done[i] = sizes[i]
      report()
      return {
        video: pick.video && fileOf(ctx.tmp, pick.video),
        audio: pick.audio && fileOf(ctx.tmp, pick.audio),
        format: pick.format,
        qualityLabel: pick.qualityLabel,
        quality: pick.quality,
        codec: pick.codec,
        notes: pick.notes,
        hevc: false,
        dolbyVision: false
      }
    },

    async extras(t, ctx) {
      const run = runs.get(t.id)
      runs.delete(t.id)
      if (!run) return { subtitles: [], notes: [] }
      return prepareYtExtras(t, ctx.tmp, run.info, run.infoPath, {
        exec: (args, signal) => yt().exec(args, { account: account(t), signal }),
        signal: ctx.signal
      })
    },

    sourceUrl(t) {
      return t.item.ytId ? ytWatchUrl(t.item.ytId) : t.meta?.url
    }
  }
}
