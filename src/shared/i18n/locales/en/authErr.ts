import type { Messages } from '../types'

export default {
  loginRequired: 'Please sign in first',
  loginRequiredAccount: 'Please sign in to your Bilibili account first',
  loginExpired: 'Your login has expired. Please sign in again',
  appBoundCookie: 'Cookies protected by app-bound encryption can’t be imported. Sign in inside the app or paste the cookies manually',
  missingKey: 'Missing the key to decrypt {prefix}',
  incompleteCookie: 'Chromium cookie encrypted data is incomplete',
  /** 没有权限读取的浏览器，在配置档名的位置显示 */
  blockedProfile: 'No permission to read',
  keychainNotFound: '“{service}” was not found in the Keychain',
  keychainDenied: 'Keychain access was not granted ({service}). Click “Allow” in the system prompt',
  secretToolMissing:
    'Reading login data from Chrome-based browsers requires secret-tool. Install it first (Debian / Ubuntu: sudo apt install libsecret-tools), or sign in inside the app instead',
  keyringNotFound:
    'The browser’s password was not found in the system keyring (application={application}), or the keyring is locked. You can also sign in inside the app instead',
  winKeyUnreadable: 'Can’t read the Windows browser’s encryption key. Sign in inside the app or paste the cookies manually',
  winKeyMissing: 'The Windows browser has no readable DPAPI key. Sign in inside the app or paste the cookies manually',
  winKeyUnsupported: 'The Windows browser’s key format is not supported. Sign in inside the app or paste the cookies manually',
  browserLocked:
    '{browser} is running, so its login data can’t be read. Quit {browser} completely (including background processes) and import again, or sign in inside the app instead',
  profileNotFound: 'This browser profile wasn’t found, or you don’t have permission to read it',
  noPermission: 'No permission to read data from {browser}',
  noLogin: 'No Bilibili login found in {browser} ({profile})',
  importedExpired: 'The imported login is no longer valid. Sign in to Bilibili again in your browser first, or sign in inside the app instead',
  cookieUnreadable: 'Can’t make sense of this. Paste cookies like “SESSDATA=…; bili_jct=…”, or JSON exported by an extension',
  noSessdata: 'It doesn’t contain SESSDATA, so you can’t sign in with it',
  cookieExpired: 'These cookies have expired. Please get them again',
  confirmTimeout: 'Timed out confirming the login. Please check your network',
  importCancelled: 'This import was canceled',
  dpapiTimeout: 'DPAPI decryption timed out. Sign in inside the app or paste the cookies manually',
  dpapiFailed: 'DPAPI decryption failed: {reason}',
  powershellExitCode: 'PowerShell exit code {code}',
  dpapiIncomplete: 'PowerShell did not return a complete decryption result',
  safariCorrupt: 'The Safari cookie file is corrupted',
  notSafariCookies: 'This is not a Safari cookie file'
} satisfies Messages['authErr']
