import type { Messages } from '../types'

// MCP の透かし除去：所要時間の見積もりの表現、バッチ内の透かしのヒント、remove_watermark の結果
export default {
  // 時間の範囲。{count} は単一の値、{lo}～{hi} は範囲
  secOne: '約 {count} 秒',
  secRange: '約 {lo}～{hi} 秒',
  minOne: '約 {count} 分',
  minRange: '約 {lo}～{hi} 分',
  hourOne: '約 {count} 時間',
  hourRange: '約 {lo}～{hi} 時間',
  // 所要時間が動画の長さの何倍か
  ratioOne: '約 {count} 倍',
  ratioRange: '約 {lo}～{hi} 倍',

  basisMeasured: 'このコンピュータで実際に処理した速度に基づく',
  basisCalibrated: '試行の速度に基づく',
  basisDefault: 'このコンピュータではまだ処理したことがないため概算',

  modelNote: '初回は約 {size} MB の AI モデルを先にダウンロードする必要があります',
  fastChoice: '高速除去（{time}。周囲の映像で埋めるため、透かしの部分は少しぼやけます）',
  fastChoiceNoTime: '高速除去（周囲の映像で埋めるため、透かしの部分は少しぼやけます）',
  aiChoice: 'AI 修復（{time}。透かしの下の映像をフレームごとに補完するため、ずっときれいです{model}）',
  aiChoiceNoTime: 'AI 修復（透かしの下の映像をフレームごとに補完するため、ずっときれいです{model}）',
  /** aiChoice のかっこ内に続ける。{model} が空なら表示されない */
  aiChoiceModel: '。{note}',
  choices: '{fast}、{ai}',

  processing: '透かしを除去中です。wait_seconds を付けて待機できます。処理が終わるとタスクの watermark.removed が true になります',
  pending:
    'ダウンロード済みの動画のうち {count} 本にビリビリの透かしがあります。まず除去するかどうかをユーザーに確認してください。選択肢は{choices}です。' +
    '透かし除去は再エンコードして元のファイルを置き換えます。ユーザーが同意したら remove_watermark batch_id={id} method=fast または method=ai を呼び出してください',
  willDetect: 'ダウンロード時に各動画にビリビリの透かしがあるかどうかを検出し、結果はここに表示されます',
  plannedOff: 'ダウンロード時にビリビリの透かしの有無を検出します。get_batch_status で確認し、透かしがある場合は remove_watermark で除去するかどうかをユーザーに確認できます',
  plannedOn: 'ビリビリの透かしを検出した動画は、ダウンロード後に透かしを除去します。再エンコードが必要です',
  plannedKnown: '長さがわかっている動画の透かし除去は合計で{time}（{basis}）',
  plannedAll: 'すべての動画の透かし除去は合計で{time}（{basis}）',
  plannedModel: '{model}。ダウンロードできない場合は高速除去に切り替えます',
  speed: '{ratio}（{basis}）',
  speedBackend: '{ratio}（{basis}、{backend}）',

  regionInvalid: 'region は {x, y, w, h} の形式で、単位は動画のピクセルでなければなりません',
  regionOneTask: 'region は 1 つのタスクとしか併用できません：動画ごとに透かしの位置やサイズが異なる可能性があるためです',
  tooManyTasks: '1 回に処理できるタスクは最大 {max} 件です',
  busy: '処理中です。終わるまで待ってください',
  tooManyInspect: '今回検出する動画が多すぎます（1 回に最大 {max} 本）。残りはもう一度呼び出してください',
  alreadyRemoved: 'すでに透かしを除去済みです。別の方式で再処理したい場合（例：高速除去のあとに AI 修復に切り替える）は force=true を渡してください',
  regionOutside: 'region が映像の範囲外か、小さすぎます（動画のサイズ {size}）',
  unsure: 'ビリビリの透かしがあるかどうか確実ではありません。あることを確認できた場合は region で位置を指定してください（suggested_region を使えます）',
  noRegion: '透かしの位置を認識できませんでした。透かしがあることを確認できた場合は region で位置を指定してください（ピクセル座標）',
  total: '合計で{time}（{basis}）',
  aiFallback: '{model}。ダウンロードできない場合や AI 修復に失敗した場合は今回は高速除去に切り替え、タスクの note にその旨が記載されます',
  dryRun: 'これは見積もりで、処理は開始していません。ユーザーが同意したら dry_run を外してもう一度呼び出してください',
  started:
    '処理中も元の動画は変わらず、完了後に置き換えられます。get_batch_status または list_tasks で watermark.processing を確認できます。キャンセルするには control_tasks action=cancel_watermark を使います',
  noneSkipped: '処理できる動画がありません。理由は skipped を参照してください',
  noneEligible:
    '処理する動画がありません：batch_id を使う場合は、ダウンロードが完了し、透かしが検出され、まだ除去されていない動画だけを処理します。それ以外は task_ids で指定してください',
  targetsMissing: 'task_ids または batch_id で処理する動画を指定してください'
} satisfies Messages['mcpWm']
