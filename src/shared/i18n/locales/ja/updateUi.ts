import type { Messages } from '../types'

export default {
  skipVersion: 'このバージョンをスキップ',
  notNow: '今はしない',
  openDownloadPage: 'ダウンロードページへ',
  downloadAndInstall: 'ダウンロードしてインストール',
  cancelDownload: 'ダウンロードをキャンセル',
  downloadInBackground: 'バックグラウンドでダウンロード',
  restartAndInstall: '再起動してインストール',
  installingButton: 'インストール中…',
  retry: '再試行',
  title: '新しいバージョン {version} があります',
  currentVersion: '現在のバージョン {version}',
  releasedOn: '{date} リリース',
  packageSize: 'インストーラー {size}',
  noNotes: 'このバージョンには更新内容の説明がありません。',
  blocker: '{blocker}。または、ダウンロードページから手動でインストールしてください。',
  skipped: 'このバージョンは以前スキップしたため、自動確認では通知しません。',
  downloading: 'ダウンロード中…ウィンドウを閉じても続行します',
  pendingTasks: '未完了のタスクが {count} 件あります。再起動すると一時停止しますが、アップデート後に再開できます。',
  ready: '新しいバージョンのダウンロードと検証が完了しました。再起動すると使えます。',
  installing: 'インストール中です。アプリはまもなく自動で再起動します…'
} satisfies Messages['updateUi']
