import type { Messages } from '../types'

export default {
  loginRequired: '先にログインしてください',
  loginRequiredAccount: '先にビリビリのアカウントでログインしてください',
  loginExpired: 'ログインの有効期限が切れました。再ログインしてください',
  appBoundCookie: 'アプリバインド暗号化された Cookie はインポートできません。アプリ内ログインを使うか、Cookie を手動で貼り付けてください',
  missingKey: '{prefix} を復号する鍵がありません',
  incompleteCookie: 'Chromium の Cookie の暗号化データが不完全です',
  /** 読み取り権限のないブラウザで、プロファイル名の位置に表示 */
  blockedProfile: '読み取り権限なし',
  keychainNotFound: 'キーチェーンに「{service}」が見つかりません',
  keychainDenied: 'キーチェーンへのアクセスが許可されませんでした（{service}）。システムのダイアログで「許可」をクリックしてください',
  secretToolMissing:
    'Chrome 系ブラウザのログイン情報を読み取るには secret-tool が必要です。先にインストールするか（Debian / Ubuntu：sudo apt install libsecret-tools）、アプリ内ログインを使ってください',
  keyringNotFound:
    'システムのキーリングにブラウザのパスワードが見つからないか（application={application}）、キーリングのロックが解除されていません。アプリ内ログインを使うこともできます',
  winKeyUnreadable: 'Windows のブラウザの暗号鍵を読み取れません。アプリ内ログインを使うか、Cookie を手動で貼り付けてください',
  winKeyMissing: 'Windows のブラウザに読み取り可能な DPAPI 鍵がありません。アプリ内ログインを使うか、Cookie を手動で貼り付けてください',
  winKeyUnsupported: 'Windows のブラウザの鍵の形式に対応していません。アプリ内ログインを使うか、Cookie を手動で貼り付けてください',
  browserLocked:
    '{browser} が実行中のため、ログイン情報を読み取れません。{browser} を完全に終了してから（バックグラウンドで動作しているものも含む）インポートするか、アプリ内ログインを使ってください',
  profileNotFound: 'このブラウザのプロファイルが見つからないか、読み取り権限がありません',
  noPermission: '{browser} のデータを読み取る権限がありません',
  noLogin: '{browser}（{profile}）にビリビリのログイン情報がありません',
  importedExpired: 'インポートしたログイン情報は無効になっています。先にブラウザでビリビリに再ログインするか、アプリ内ログインを使ってください',
  cookieUnreadable: '内容を認識できません。「SESSDATA=…; bili_jct=…」のような Cookie、または拡張機能でエクスポートした JSON を貼り付けてください',
  noSessdata: 'SESSDATA が含まれていないため、ログインできません',
  cookieExpired: 'この Cookie はすでに無効です。もう一度取得してください',
  confirmTimeout: 'ログインの確認がタイムアウトしました。ネットワークを確認してください',
  importCancelled: '今回のインポートはキャンセルされました',
  dpapiTimeout: 'DPAPI での復号がタイムアウトしました。アプリ内ログインを使うか、Cookie を手動で貼り付けてください',
  dpapiFailed: 'DPAPI での復号に失敗しました：{reason}',
  powershellExitCode: 'PowerShell の終了コード {code}',
  dpapiIncomplete: 'PowerShell から完全な復号結果が返されませんでした',
  safariCorrupt: 'Safari の Cookie ファイルが破損しています',
  notSafariCookies: 'Safari の Cookie ファイルではありません'
} satisfies Messages['authErr']
