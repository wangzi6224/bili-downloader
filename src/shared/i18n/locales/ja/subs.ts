import type { Messages } from '../types'

export default {
  interval30m: '30 分',
  interval1h: '1 時間',
  interval3h: '3 時間',
  interval6h: '6 時間',
  interval12h: '12 時間',
  interval1d: '1 日',
  everyInterval: '{interval}ごと',
  title: '購読',
  subtitle:
    'アプリの実行中、お気に入りフォルダ、コレクション、アニメ、投稿者などのソースを一定間隔で確認し、新しいコンテンツがあれば購読時のオプションで自動ダウンロードします。',
  empty: 'まだ購読はありません',
  emptyHint: 'お気に入りフォルダ、コレクション、アニメ、投稿者のページを解析したあと、選択ウィンドウ下部の「更新を購読」をクリックすると追加できます。',
  enabled: '有効',
  disabled: '無効',
  lastNew: '前回 {count} 件の新しいコンテンツを検出',
  checking: '確認中…',
  checkNow: '今すぐ確認',
  unsubscribe: '購読を解除',
  unsubscribeConfirm: '「{title}」の購読を解除しますか？'
} satisfies Messages['subs']
