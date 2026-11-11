import type { Messages } from '../types'

export default {
  /** API が会員ラベルを返さなかったときに表示 */
  vipDefault: 'プレミアム会員',
  notifyDoneTitle: 'ダウンロード完了',
  notifyDoneBody: '{count} 件のタスクがすべて完了しました',
  notifyFailedTitle: 'ダウンロード終了（失敗したタスクあり）',
  notifyFailedBody: '{done} 件完了、{failed} 件失敗',
  notifySubsTitle: '購読に更新があります',
  notifySubsBody: '「{title}」に {count} 件の新しいコンテンツがあり、ダウンロードに追加しました',
  fetchingParts: '動画のパートを取得中',
  partsUnavailable: '{count} 本の動画を取得できません（{reason}）'
} satisfies Messages['misc']
