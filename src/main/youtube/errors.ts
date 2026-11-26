// 把 yt-dlp 的报错归到下载队列认识的几类：要登录、风控（过一会儿再试）、无法下载、网络、磁盘、组件问题
import { t } from '@shared/i18n'
import { UnsupportedError } from '../bili/http'
import { DiskError, DownloadError, NeedsUserError } from '../download/errors'

/** 要登录 YouTube 才能下（年龄限制、会员专享、私享、个人列表）：任务改为等待登录，只影响它自己 */
export class YtLoginRequiredError extends NeedsUserError {}

/** YouTube 的机器人验证、429：过一会儿再试，导入 cookie 后通常就好了 */
export class YtRateLimitError extends DownloadError {}

/** 签名 / n 参数挑战解不开、提取失败：多半是 yt-dlp 太旧，检查更新后再试 */
export class YtEngineError extends DownloadError {}

/** yt-dlp 输出里最后一条 ERROR 的正文，去掉 “ERROR: [youtube] id:” 前缀 */
export function lastError(stderr: string): string | undefined {
  const lines = stderr.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'))
  const last = lines.at(-1)
  return last?.replace(/^ERROR:\s*(?:\[[^\]]+\]\s*)?(?:[\w-]{11}:\s*)?/, '').trim()
}

const RULES: [RegExp, (reason: string) => Error][] = [
  // 机器人验证的提示里也带 “--cookies”，要排在登录前面
  [/confirm you(?:'|’)?re not a bot|confirm you are not a bot|HTTP Error 429|Too Many Requests|rate.?limit/i, (r) => new YtRateLimitError(t('yt.errBot', { reason: r }))],
  [/confirm your age|age.?restricted|inappropriate for some users/i, (r) => new YtLoginRequiredError(t('yt.errAge', { reason: r }))],
  [/members.?only|join this channel|available to this channel's members/i, (r) => new YtLoginRequiredError(t('yt.errMembers', { reason: r }))],
  [/private video|video is private|playlist does not exist|The playlist is private|need to log in|requires? (?:a )?(?:login|authentication)|Sign in to|--cookies/i, (r) => new YtLoginRequiredError(t('yt.errLogin', { reason: r }))],
  [/premium/i, (r) => new UnsupportedError(t('yt.errPremium', { reason: r }))],
  [/DRM/, (r) => new UnsupportedError(t('yt.errDrm', { reason: r }))],
  [/not available in your country|geo.?restrict|blocked it in your country|not made this video available in your country/i, (r) => new UnsupportedError(t('yt.errGeo', { reason: r }))],
  [/Premieres in|live event will begin|will begin in|is upcoming|scheduled/i, (r) => new UnsupportedError(t('yt.errUpcoming', { reason: r }))],
  [/video unavailable|video is unavailable|has been removed|terminated|no longer available|does not exist|Incomplete YouTube ID|is not a valid URL|Unsupported URL/i, (r) => new UnsupportedError(t('yt.errUnavailable', { reason: r }))],
  [/No space left|Errno 28/i, () => new DiskError(t('download.diskFull'))],
  [/n challenge|nsig|signature|JS challenge|JavaScript runtime|Unable to extract|Only images are available|Requested format is not available/i, (r) => new YtEngineError(t('yt.errEngine', { reason: r }))],
  [/HTTP Error (?:403|5\d\d)|timed out|Connection (?:reset|refused|aborted)|name resolution|Name or service not known|getaddrinfo|Unable to download|SSL|EOF occurred|IncompleteRead|ECONNRESET|Errno 104|Network is unreachable|proxy/i, (r) => new DownloadError(t('yt.errNetwork', { reason: r }))]
]

/** yt-dlp 非 0 退出时转成对应的错误 */
export function classifyYtError(stderr: string, code: number | null): Error {
  const reason = lastError(stderr) ?? (stderr.trim().split(/\r?\n/).at(-1)?.slice(0, 300) || t('yt.errExit', { code: String(code) }))
  for (const [re, make] of RULES) if (re.test(reason)) return make(reason)
  return new Error(t('yt.errOther', { reason }))
}
