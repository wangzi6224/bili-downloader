import type { Messages } from '../types'

export default {
  varTitle: 'タイトル（パート / エピソードのタイトル）',
  varSeries: 'コレクション、シリーズ、複数パートの動画の全体タイトル。単体の動画では空',
  varIndex: '番号',
  varOwner: '投稿者',
  varOwnerMid: '投稿者 UID',
  varPubdate: '公開日時',
  varDate: 'タスクの作成日時',
  varQuality: '画質',
  varCodec: 'コーデック',
  varBvid: 'BV 番号',
  varAid: 'av 番号',
  varCid: 'cid',
  varEpId: 'アニメのエピソード ID',
  varType: '種類（動画 / アニメ・映画・ドラマ）',
  empty: 'テンプレートを空にすることはできません',
  nested: '省略可能部分 <…> は入れ子にできません',
  extraClose: '> が 1 つ多すぎます',
  unclosed: '省略可能部分 <…> が閉じられていません',
  /** variable は波かっこ付きの変数（例：{foo}） */
  unknownVar: '不明な変数 {variable}',
  unfinishedBrace: '変数の波かっこが閉じられていません'
} satisfies Messages['naming']
