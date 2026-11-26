import type { Settings, TaskInfo, WaitReason } from '@shared/types'
import type { DashStream } from '../../bili/playurl'
import type { PreparedExtras } from '../extras'
import type { OutFormat } from '../mux'

/** 驱动拿到的音视频：文件已经下载到任务的临时目录里，等合并 */
export interface AvAcquired {
  /** 临时目录里的视频文件；只要音频时没有 */
  video?: string
  audio?: string
  /** 声音在视频文件里，没有单独的音轨 */
  muxed?: boolean
  format: OutFormat
  qualityLabel: string
  /** 命名模板的 {quality}、{codec} */
  quality: string
  codec: string
  notes: string[]
  hevc: boolean
  dolbyVision: boolean
  /** B站 DASH 视频流：自动去水印要按它判断编码、HDR */
  wmStream?: DashStream
}

/** 多文件作品（图文、实况图）：不合并，整个放进一个目录 */
export interface FilesAcquired {
  /** path 是临时目录里下好的文件，name 是成品目录里的文件名 */
  files: { path: string; name: string }[]
  qualityLabel: string
  quality: string
  codec: string
  notes: string[]
}

export type Acquired = AvAcquired | FilesAcquired

export interface DriverContext {
  /** 任务的临时目录（还不一定存在） */
  tmp: string
  signal: AbortSignal
  /** 每次用时现读：下载期间改了设置，后面的步骤按新的来 */
  settings: () => Settings
  /** 在任务所属账号的会话里执行（B站多账号） */
  withAccount: <T>(fn: () => Promise<T>) => Promise<T>
  /** 选好了要下的流，开始下载；lock 是要记在任务上的格式（YouTube、抖音续传时沿用） */
  onPlanned: (p: { qualityLabel: string; videoQn?: number; lock?: string }) => void
  /** 已下载和总字节数（总数不知道时用估算值） */
  onProgress: (downloaded: number, total: number) => void
}

/** 一个平台怎么取流、下载和准备封面字幕这些附加内容；合并、去水印、命名和状态由下载队列统一处理 */
export interface PlatformDriver {
  acquire(t: TaskInfo, ctx: DriverContext): Promise<Acquired>
  /**
   * 开始下载前问一下这个任务现在能不能跑：login / verify 转为等待用户；cooling 先排着，
   * 冷却结束后由平台一方让队列重新调度
   */
  hold?(t: TaskInfo): WaitReason | 'cooling' | undefined
  extras(t: TaskInfo, ctx: DriverContext): Promise<PreparedExtras>
  /** 写进成品元数据 comment 的原视频地址 */
  sourceUrl(t: TaskInfo): string | undefined
}

/** 只会给出单个音视频的平台 */
export interface AvDriver extends PlatformDriver {
  acquire(t: TaskInfo, ctx: DriverContext): Promise<AvAcquired>
}
