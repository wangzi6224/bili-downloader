import type { Messages } from '../types'

export default {
  title: 'ウィンドウを閉じる',
  subtitle: 'バックグラウンド実行中もダウンロードと購読の確認は続き、{reopenFrom}からウィンドウを再度開けます。',
  pendingTasks: '未完了のタスクが {count} 件あります。完全に終了すると一時停止しますが、次回起動後に再開できます。',
  remember: '選択を記憶して、今後は確認しない',
  rememberHint: 'あとで「設定 → 一般」で変更できます',
  cancel: 'キャンセル',
  quit: '完全に終了',
  background: 'バックグラウンドで実行'
} satisfies Messages['closeDialog']
