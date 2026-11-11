import type { Messages } from '../types'

export default {
  title: '解析履歴',
  subtitle: '解析したリンクはすべてここにあります。クリックすると選択ウィンドウが再び開き、残りのエピソードを続けてダウンロードできます。',
  search: 'タイトルまたはリンクを検索',
  clearConfirm: '解析履歴をすべて消去しますか？',
  clear: '消去',
  empty: 'まだ解析履歴はありません',
  emptyHint: 'ダウンロードページでリンクを貼り付けて解析すると、ここに自動で記録されます。',
  noMatch: '一致する履歴がありません',
  kindPgc: 'アニメ・映画・ドラマ',
  kindVideo: '動画',
  itemCount: '{count} 項目',
  remove: 'この履歴を削除'
} satisfies Messages['history']
