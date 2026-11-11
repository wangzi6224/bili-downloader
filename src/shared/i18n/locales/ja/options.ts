import type { Messages } from '../types'

export default {
  modelMissing: '{text}。最初に透かしを除去するときに自動でダウンロードすることもできます',
  cancel: 'キャンセル',
  retry: '再試行',
  downloadModel: 'モデルをダウンロード',
  codecAvcHint: '互換性が最も高い',
  codecHevcHint: 'ファイルサイズが小さい',
  outputFull: '完全な動画',
  outputFullHint: '映像と音声を 1 つのファイルにまとめます',
  outputAudio: '音声のみ',
  outputAudioHint: '音声だけを保存します（m4a、ロスレスは flac）',
  outputVideo: '映像のみ',
  outputVideoHint: '映像だけを保存します。音声は含まれません',
  raisePriority: '優先度を上げる',
  codecFallback: 'この画質には {wanted} がないため、{actual} をダウンロードします',
  content: 'ダウンロード内容',
  noAudioTrack: 'この動画には独立した音声トラックがありません',
  codecOrder: 'コーデックの優先順位',
  audio: '音質',
  audioUnavailable: '（この動画にはありません）',
  audioHint:
    '「最高」：完全な動画では Dolby を優先（MKV ではロスレスを優先）、音声のみではロスレスを優先します。指定した音質がない場合は自動で下げます',
  container: 'コンテナ形式',
  mp4Hint: 'QuickTime や iPhone でそのまま再生できます',
  mkvHint: 'ロスレス音声を格納でき、字幕や Dolby Vision との互換性も高い',
  watermark: '透かし',
  watermarkAutoHint:
    '透かしを検出した場合のみ処理します。動画を再エンコードするため、そのままダウンロードするよりかなり時間がかかります。成功すると透かしを除去したバージョンだけが残ります。HDR と Dolby Vision の動画は処理しません。',
  watermarkAiHint:
    '透かしを検出した場合のみ処理し、AI モデルで透かしの下の映像をフレームごとに補完します。高速除去よりずっときれいですが、かなり遅くなります。GPU がある場合で動画の長さの約 2～4 倍、GPU がないとさらに時間がかかります。モデルをダウンロードできない場合や AI 修復に失敗した場合は、今回は高速除去に切り替えます。HDR と Dolby Vision の動画は処理しません。',
  extras: '追加コンテンツ',
  embedCover: 'カバー画像をファイルに埋め込む',
  cover: 'カバー画像を別途保存',
  embedSubtitle: '字幕を動画に埋め込む',
  subtitle: '字幕を .srt で別途保存',
  chapters: 'チャプター（シークバーの区切り）',
  nfo: 'NFO メタデータ',
  danmaku: '弾幕',
  danmakuAss: 'ASS（プレーヤーで重ねて表示）',
  danmakuXml: 'XML（元データ）',
  nfoHint: 'Kodi / Jellyfin / Emby で認識できる .nfo を生成します。アニメでは tvshow.nfo とポスターも生成します'
} satisfies Messages['options']
