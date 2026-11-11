import type { Messages } from '../types'

// 透かし除去（高速除去、AI 修復）に関するエラーとタスクのヒント
export default {
  // shared/watermark.ts：透かしが画面のどの隅にあるか
  cornerTopLeft: '左上',
  cornerTopRight: '右上',
  cornerBottomLeft: '左下',
  cornerBottomRight: '右下',

  // タスクのヒント（tasks.json に保存される）
  noteNone: '透かし除去：透かしを検出できなかったため、元の動画を残しました（タスクの「透かしを除去…」から手動で範囲を指定できます）',
  noteStatic:
    '透かし除去：映像の変化が少なすぎて自動で検出できなかったため、元の動画を残しました（タスクの「透かしを除去…」から手動で範囲を指定できます）',
  noteFewFrames:
    '透かし除去：動画が短すぎるか映像が暗すぎて自動で検出できなかったため、元の動画を残しました（タスクの「透かしを除去…」から手動で範囲を指定できます）',
  noteHdr: '透かし除去：HDR と Dolby Vision の動画にはまだ対応していないため、元の動画を残しました',
  noteInterrupted: '透かし除去が完了しませんでした（途中でアプリが終了しました）。元の動画を残しました',
  noteMoved: '透かし除去が完了しませんでした：処理中に元の動画が移動または削除されました',
  noteFailed: '透かし除去に失敗しました：{reason}。元の動画を残しました',
  /** reason 自体が「透かし除去に失敗しました：…」「透かし除去がタイムアウトしました：…」のような完全な説明 */
  noteFailedWhole: '{reason}。元の動画を残しました',
  noteAiFallback: '透かし除去：AI モデルをダウンロードできなかったため（{reason}）、今回は高速除去を使いました',
  noteAiFailed: '透かし除去：AI 修復を完了できなかったため（{reason}）、今回は高速除去を使いました',

  // 検出、処理
  modelNotDone: 'ダウンロードが完了していません',
  noVideoFrame: '動画の映像が見つかりません',
  noVideoInFile: 'ファイルに映像がありません',
  hdrUnsupported: 'HDR と Dolby Vision の動画にはまだ対応していません',
  regionTooSmall: '透かしの領域が小さすぎます',
  taskMissing: 'タスクが存在しません',
  notDone: '処理できるのはダウンロードが完了した動画だけです',
  audioOnly: 'このタスクは音声のみで、映像がありません',
  fileMissing: '動画ファイルが見つかりません。移動または削除された可能性があります',
  grabFailed: '動画からフレームを取り出せませんでした',
  previewFailed: 'プレビュー画像を生成できませんでした',
  probeFailed: '動画の情報を読み取れません',
  probeFailedNoFile: '動画の情報を読み取れません：ファイルが存在しません',
  ffNoResponse: 'ffmpeg が応答しません',
  ffTooMuchOutput: 'ffmpeg の出力データが想定を超えました',
  ffStalled: '透かし除去がタイムアウトしました：ffmpeg が長時間進んでいません',
  stalled: '透かし除去がタイムアウトしました：長時間進んでいません',
  encoderExited: 'エンコードプロセスが終了しました',

  // AI 修復
  backendCoreml: 'Apple Neural Engine',
  /** システムのタスクマネージャーに表示される推論サブプロセスの名前 */
  hostServiceName: 'AI 透かし除去',
  badInference: '推論結果が異常です',
  noAiBackend: '利用できる AI 推論の方式がありません（{errors}）',
  modelNotLoaded: 'モデルがまだ読み込まれていません',
  modelNoImage: 'モデルが画像を出力しませんでした',
  hostExited: '推論プロセスが予期せず終了しました（コード {code}）',
  exitCodeUnknown: '不明',
  loadTimeout: 'モデルの読み込みがタイムアウトしました',
  inferTimeout: '推論がタイムアウトしました',
  modelUnreachable: 'モデルのダウンロード先に接続できません（{names}）。ネットワークを確認するか、設定でプロキシを構成してください',
  modelChecksum: 'ダウンロードしたモデルファイルの検証に失敗しました。もう一度お試しください',
  modelMissing: 'AI モデルがまだダウンロードされていません',
  modelIncomplete: 'モデルファイルが不完全です',
  modelBadFormat: 'モデルファイルの形式が正しくありません',
  modelBadSize: 'モデルのサイズが無効です',
  modelNoGraph: 'モデルファイルに計算グラフがありません',
  modelInputNotImage: 'モデルの入力が画像ではありません',
  maskSize: 'マスクのサイズが正しくありません',
  outputSize: 'モデルの出力サイズが正しくありません'
} satisfies Messages['wm']
