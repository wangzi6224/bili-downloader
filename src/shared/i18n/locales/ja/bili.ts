import type { Messages } from '../types'

// ビリビリのリンク解析・ストリーム取得時のエラー、画面上のグループ見出し、音質ラベル
export default {
  // http.ts
  authExpired: 'ログインが無効になりました。再ログインしてください',
  riskControl: 'リクエストがビリビリのアクセス制限によりブロックされました（HTTP 412）。しばらくしてから再試行してください',
  serverError: 'ビリビリのサーバーエラー（HTTP {status}）',
  networkFailed: 'ネットワークリクエストに失敗しました：{error}',
  wbiKeyFailed: 'WBI 署名鍵の取得に失敗しました',
  badResponse: 'API から解析できない内容が返されました（HTTP {status}）',
  apiError: 'API エラー（{code}）',

  // 解析結果のグループ見出し
  groupAudioMenu: 'プレイリスト',
  groupCourse: '講座',
  groupFav: 'お気に入りフォルダ',
  groupSpace: '投稿動画',
  groupSeason: 'コレクション',
  groupSeries: 'シリーズ',
  groupWatchLater: '後で見る',
  groupRank: '{label}ランキング',
  groupMain: '本編',
  groupStein: 'インタラクティブ動画のストーリー分岐',
  groupPages: 'パート',
  /** お気に入りフォルダ内の無効になった動画 */
  unavailable: '無効',

  // lists.ts、lookup.ts、resolve.ts
  spaceRejected:
    'ビリビリが投稿者の投稿一覧の取得リクエストを一時的に拒否しました（{error}）。しばらくしてから再試行してください。投稿者のコレクションやお気に入りフォルダのリンクを貼り付けることもできます',
  weeklyNoNumber: '毎週の必見の号数を取得できませんでした',
  captcha: 'ビリビリから CAPTCHA による認証を求められたため、今回の検索結果はありません',
  unrecognized: 'ビリビリの動画、アニメ、講座、お気に入りフォルダ、投稿者のリンクを認識できませんでした',
  batchAllFailed: '{count} 件すべてのリンクの解析に失敗しました：{error}',
  batchTitle: '一括解析（{count} 件のソース）',

  // ランキングのカテゴリ（画面表示用）
  rankAll: '全体',
  rankDouga: 'アニメーション',
  rankMusic: '音楽',
  rankDance: 'ダンス',
  rankGame: 'ゲーム',
  rankKnowledge: '知識',
  rankTech: 'テクノロジー',
  rankSports: 'スポーツ',
  rankCar: '自動車',
  rankLife: 'ライフ',
  rankFood: 'グルメ',
  rankAnimal: '動物',
  rankKichiku: '音MAD',
  rankFashion: 'ファッション',
  rankEnt: 'エンタメ',
  rankCinephile: '映画・ドラマ',
  rankOrigin: 'オリジナル',
  rankRookie: '新人',

  // 音質
  audioBest: '最高',
  audioFlac: 'Hi-Res ロスレス',
  audioDolby: 'Dolby Atmos',
  audioLossless: 'ロスレス',
  /** タスクに表示する音声の品質。label は「320K」「ロスレス」など */
  audioQuality: '音声 {label}',
  audioNoUrl: 'この曲のダウンロードアドレスを取得できません',
  audioNoUrlReason: 'この曲のダウンロードアドレスを取得できません：{reason}',

  // danmaku.ts
  danmakuHttpFailed: '弾幕のダウンロードに失敗しました（HTTP {status}）',

  // playurl.ts
  courseNoAccess: 'この講義の視聴権限がありません（購入が必要な可能性があります）：{reason}',
  courseDrm: 'この講義は DRM で暗号化されているため、ダウンロードできません',
  coursePreview: '現在のアカウントではこの講義のお試し視聴しかできません（購入が必要です）',
  audioNotVideo: '音声は動画のストリーム取得 API を使いません',
  regionLocked: '地域制限：{reason}',
  needVip: 'プレミアム会員が必要です：{reason}',
  drm: 'このコンテンツは DRM で暗号化されているため、ダウンロードできません',
  previewOnly: '現在のアカウントではこのコンテンツのお試し視聴しかできません（プレミアム会員または購入が必要です）',
  flvOnly: 'この動画には旧式の FLV 形式しかなく、まだ対応していません',
  noAudioTrack: 'この動画には独立した音声トラックがありません',
  noVideoStream: '利用できる映像ストリームがありません',
  codecFallback: 'この画質には {wanted} がないため、{actual} に切り替えました',
  flacToMkv: 'Hi-Res ロスレス音声は MP4 に格納すると互換性が低いため、MKV に切り替えました',
  /** 画質ラベルで「映像のみ」を示す印 */
  mute: '音声なし'
} satisfies Messages['bili']
