import type { Messages } from '../types'

export default {
  separator: '。',
  parseFailures: '{count} 件のリンクの解析に失敗しました：{errors}',
  watchLater: '後で見る',
  popular: '人気',
  weekly: '毎週の必見（最新号）',
  rank: '{name}ランキング',
  myFavorites: '自分のお気に入りフォルダ',
  loading: '読み込み中…',
  noFavorites: 'お気に入りフォルダがありません',
  myMenu: '後で見る、人気、自分のお気に入りフォルダ',
  myMenuLoggedOut: 'ログイン後に利用可能：後で見る、人気、自分のお気に入りフォルダ',
  batchTitle: '一括解析',
  batchSubtitle:
    '1 行に 1 つのリンク（BV 番号、アニメ、お気に入りフォルダ、投稿者のいずれも可）を入力します。1 つずつ解析したあと、まとめて選択できます。',
  detectedLinks: '{count} 件のリンクを検出',
  cancel: 'キャンセル',
  parseCount: '{count} 件を解析',
  placeholder: '動画、コレクション、アニメ、講座、お気に入りフォルダ、投稿者のリンクを貼り付け',
  pasteAndParse: 'クリップボードから貼り付けて解析',
  parsing: '解析中',
  parse: '解析',
  batchButton: '一括解析：複数行のリンクをまとめて貼り付け',
  parsingProgress: '解析中 {done}/{total}',
  clipboardLinks: 'クリップボードに {count} 件のリンクがあります',
  clipboardLink: 'クリップボードのリンクを検出しました'
} satisfies Messages['input']
