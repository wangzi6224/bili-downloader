/** 导入登录信息失败的原因，MCP 据此判断下一步（界面只用 message） */
export type ImportErrorCode =
  | 'locked'
  | 'app_bound'
  | 'blocked'
  | 'no_login'
  | 'expired'
  | 'keychain_denied'
  | 'not_found'
  | 'cancelled'
  | 'failed'

export class ImportError extends Error {
  constructor(
    public code: ImportErrorCode,
    message: string
  ) {
    super(message)
  }
}

/** 用户在登录尝试完成前退出了这个账号。 */
export class LoginRevokedError extends Error {}
