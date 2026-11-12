import type { Messages } from '../types'

export default {
  ok: 'OK',
  cancel: 'キャンセル',
  logoutMessage: 'ログアウトしますか？',
  logoutDetail: 'ログアウトすると、再度インポートまたはログインが必要です。',
  mcpLogoutMessage: 'AI アシスタントが「{name}」からのログアウトを求めています。ログアウトしますか？',
  logoutConfirm: 'ログアウト',
  upToDate: '最新バージョンです',
  currentVersion: '現在のバージョン {version}',
  quitPending: '未完了のタスクが {count} 件あります。終了しますか？',
  quitPendingDetail:
    'ダウンロードが終わっていないタスクは一時停止され、次回起動後に「すべて再開」をクリックすれば続きからダウンロードできます。ダウンロード済みの部分は失われません。透かし除去中の動画は元のまま残ります。',
  runInBackground: 'バックグラウンドで実行',
  quit: '終了',
  closeBrowserMessage: 'ビリビリのログイン情報をインポートするために {browser} を閉じますか？',
  closeBrowserRequest: 'AI アシスタントがビリビリのログイン情報のインポートを求めていますが、{browser} が実行中のためデータを読み取れません。',
  closeBrowserRisk: '閉じると保存していない内容が失われる可能性があります。{browser} がすぐに終了しない場合は強制終了されます。',
  closeBrowserAppBound: '{browser} はアプリバインド暗号化を有効にしているため、閉じてもログイン情報を読み取れない可能性があります。',
  closeBrowserUnknown: '{browser} にビリビリのログイン情報があるかどうかは、まだわかりません。',
  closeBrowserConfirm: '{browser} を閉じてインポート',
  useQrInstead: 'QR コードを使う',
  loginWindowTitle: 'ビリビリにログイン',
  chooseDownloadDir: 'ダウンロード先を選択'
} satisfies Messages['dialogs']
