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

/** macOS 系统设置里的“完全磁盘访问权限” */
export const FULL_DISK_ACCESS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
