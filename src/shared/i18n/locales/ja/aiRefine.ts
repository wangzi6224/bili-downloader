import type { Messages } from '../types'

export default {
  lessThanMinute: '1 分未満',
  aboutMinutes: '約 {count} 分',
  aboutMinutesRange: '約 {min}～{max} 分',
  aboutHours: '約 {count} 時間',
  aboutHoursRange: '約 {min}～{max} 時間',
  estimate: '予想所要時間 {range} · {device} を使用',
  hintCpu: 'このコンピュータでは GPU による高速化が使えず、CPU だけで処理するため時間がかかります。',
  hintReuse: '映像が静止している部分はそのまま流用します（フレームの約 {pct}%）。',
  hintFallback: '透かしの輪郭を認識できなかったため、枠全体を描き直します。期待どおりの結果にならない場合があります。',
  modelReady: 'AI モデルの準備ができました',
  modelVerifying: 'モデルを検証中…',
  modelDownloading: 'AI モデルをダウンロード中 {pct}%（{done} / {size}）',
  modelDownloadingFrom: '{source} から AI モデルをダウンロード中 {pct}%（{done} / {size}）',
  modelFailed: 'モデルのダウンロードに失敗しました：{message}',
  unknownReason: '不明な原因',
  modelMissing: 'AI 修復を使うには先にモデルをダウンロードする必要があります（{size}、ダウンロードは 1 回だけ）',
  settingsReady: 'ダウンロード済みです。透かし除去で「AI 修復」を選んだときに使われます。削除すると、次に使うときに再ダウンロードが必要です。',
  settingsReadyDisk:
    'ダウンロード済みで、キャッシュを含めて {disk} を使用しています。透かし除去で「AI 修復」を選んだときに使われます。削除すると、次に使うときに再ダウンロードが必要です。',
  settingsNeeded: '透かし除去で「AI 修復」を選んだときに必要です。初回使用時にダウンロードします（{size}）。',
  settingsNeededPartial:
    '透かし除去で「AI 修復」を選んだときに必要です。初回使用時にダウンロードします（{size}）。ダウンロードが途中の部分が {disk} を使用しています。',
  settingsError: '{error}。透かし除去で「AI 修復」を選んだときに必要です。初回使用時にダウンロードします（{size}）。',
  speedRatio: '動画の長さの約 {count} 倍',
  speedRatioRange: '動画の長さの約 {min}～{max} 倍',
  basisMeasured: 'このコンピュータでの実測',
  basisCalibrated: '試行に基づく見積もり',
  basisRough: '概算',
  modeOff: '処理しない',
  modeOffHint: '元の動画を残し、再エンコードしません',
  modeAuto: '高速除去',
  modeAutoHint: '周囲の映像で埋めます。透かしの部分は少しぼやけます',
  modeAi: 'AI 修復',
  modeAiHint: 'AI モデルで透かしの下の映像をフレームごとに補完します。ずっときれいです',
  hintWithSpeed: '{hint}。{speed}'
} satisfies Messages['aiRefine']
