// 抖音请求失败的几种情况，下载队列、订阅和 MCP 按类型区别处理
import { t } from '@shared/i18n'
import { UnsupportedError } from '../bili/http'
import { CooldownError, DownloadError, NeedsUserError } from '../download/errors'
import type { DyRequest } from './transport/types'

/** 平台要求完成安全验证：probe 是触发它的请求，验证时重发一次好让验证框再出现 */
export class DyVerifyError extends NeedsUserError {
  constructor(public probe?: DyRequest) {
    super(t('dy.errVerify'), 'verify')
  }
}

/** 要登录抖音才能继续 */
export class DyLoginError extends NeedsUserError {
  constructor(message = t('dy.errLogin')) {
    super(message, 'login')
  }
}

/** 被限流：过一会儿再试 */
export class DyCooldownError extends CooldownError {
  constructor(until: number, now = Date.now()) {
    super(t('dy.errCooldown', { minutes: Math.max(1, Math.ceil((until - now) / 60_000)) }), until)
  }
}

/** 网络、页面没响应这类过一会儿再试可能就好的错误 */
export class DyError extends DownloadError {}

/** 接口明确返回的业务错误（参数不对等），重试没有意义 */
export class DyApiError extends Error {
  constructor(
    reason: string,
    public code: number
  ) {
    super(t('dy.errApi', { reason }))
  }
}

/** 作品删除、私密、付费：标记为无法下载 */
export class DyUnavailableError extends UnsupportedError {}
