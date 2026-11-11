import type { Messages } from '../types'

// ダウンロード、結合、追加コンテンツ（カバー画像、字幕、弾幕）に関するエラーとヒント
export default {
  // errors.ts：ファイルシステムのエラー
  diskFull: 'ディスクの空き容量が不足しています',
  /** 下のいくつかのエラーの後ろに付けて、エラーが起きたパスを示す */
  atPath: '：{path}',
  noWritePermission: '書き込み権限がありません{where}',
  readOnlyDisk: '保存先のディスクは読み取り専用です{where}',
  dirMissing: 'ダウンロード先が存在しないか、外付けディスクが取り外されています{where}',
  writeFailed: 'ファイルの書き込みに失敗しました（{code}）{where}',

  // extras.ts
  coverFailed: 'カバー画像のダウンロードに失敗しました：{error}',
  noCcSubtitle: 'CC 字幕がありません',
  subtitleFailed: '字幕 / チャプターの取得に失敗しました：{error}',
  danmakuFailed: '弾幕のダウンロードに失敗しました：{error}',
  coverSaveFailed: 'カバー画像の保存に失敗しました：{error}',
  subtitleSaveFailed: '字幕の保存に失敗しました：{error}',
  danmakuSaveFailed: '弾幕の保存に失敗しました：{error}',
  nfoSaveFailed: 'NFO の保存に失敗しました：{error}',
  embedFallback: 'カバー画像 / 字幕 / チャプターを動画に埋め込めなかったため、別々に保存しました',

  // fetchFile.ts
  sizeFailed: 'ファイルサイズの取得に失敗しました（HTTP {status}）',
  connectFailed: 'ダウンロードサーバーへの接続に失敗しました：{error}',
  timeout: '接続がタイムアウトしました',
  httpFailed: 'ダウンロードに失敗しました（HTTP {status}）',
  badRange: 'サーバーから返されたデータの範囲が正しくありません',
  interrupted: '接続が中断されました',
  incomplete: 'ファイルが不完全です（{done}/{total}）',

  // manager.ts
  deleteFailed: '{count} 個のファイルを削除できませんでした：{files}',
  busy: 'この動画は処理中です。終わるまでお待ちください',
  badRegion: '透かしの領域が無効です',
  fileLocked: '元の動画がほかのプログラムで使用中のため、置き換えられませんでした',

  // mux.ts：ffmpeg のエラー。action は下の 3 つのいずれか
  actionMux: '結合',
  actionWatermark: '透かし除去',
  actionRead: '動画の読み込み',
  ffNoSpace: '{action}に失敗しました：ディスクの空き容量が不足しています',
  ffNoPermission: '{action}に失敗しました：保存先フォルダへの書き込み権限がありません',
  ffLogoOutside: '{action}に失敗しました：透かしの位置が映像の範囲外です',
  ffEncoder: '{action}に失敗しました：エンコーダーが使用できません',
  ffCorrupt: '{action}に失敗しました：ダウンロードしたファイルが破損しています。「再ダウンロード」をクリックしてください',
  ffContainer: '結合に失敗しました：このコーデックは現在のコンテナ形式に格納できません。設定で MKV に変更してください',
  ffExit: '{action}に失敗しました（ffmpeg の終了コード {code}）：{detail}',
  ffSpawn: 'ffmpeg を実行できません：{error}',
  muxTimeout: '結合がタイムアウトしました。ffmpeg が応答しません'
} satisfies Messages['download']
