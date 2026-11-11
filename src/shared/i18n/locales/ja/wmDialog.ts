import type { Messages } from '../types'

export default {
  methodFast: '高速',
  methodFastHint: '周囲の映像で埋めます。数分で終わりますが、透かしの部分は少しぼやけます',
  methodAi: 'AI 修復',
  methodAiHint: 'AI モデルで透かしの下の映像をフレームごとに補完します。ずっときれいですが、遅くなります',
  title: '透かし除去',
  subtitle: '枠をドラッグして透かしを覆い、四隅と四辺をドラッグしてサイズを調整します。処理時は動画を再エンコードし、完了後に元のファイルを置き換えます。',
  alreadyApplied: 'この動画はすでに 1 回透かしを除去しています。再度処理するともう一度再エンコードされ、画質が少し低下します。',
  detected: '{corner}の透かしを検出しました。枠はさらに調整できます。',
  notDetected: '透かしを自動で検出できませんでした。枠を透かしの上にドラッグしてください。',
  frameAlt: '動画の映像',
  regionLabel: '透かしの領域。矢印キーで移動、Shift を押しながらで 10 ピクセルずつ移動',
  detecting: '透かしを検出中…',
  nextFrame: '別のフレーム',
  showOriginal: '元の映像を見る',
  preview: '効果をプレビュー',
  reset: 'リセット',
  cancel: 'キャンセル',
  retry: '再試行',
  downloadModel: 'モデルをダウンロード',
  estimating: '所要時間を見積もり中（初回はモデルの読み込みと数フレームの試行で十数秒かかります）…',
  startAi: 'AI 修復を開始',
  start: '処理を開始'
} satisfies Messages['wmDialog']
