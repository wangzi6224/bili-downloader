import type { Messages } from '../types'

export default {
  modelMissing: '{text}; it can also be downloaded automatically the first time you remove a watermark',
  cancel: 'Cancel',
  retry: 'Retry',
  downloadModel: 'Download model',
  codecAvcHint: 'Best compatibility',
  codecHevcHint: 'Smaller files',
  outputFull: 'Full video',
  outputFullHint: 'Picture and sound in one file',
  outputAudio: 'Audio only',
  outputAudioHint: 'Save only the sound (m4a, or flac for lossless)',
  outputVideo: 'Video only',
  outputVideoHint: 'Save only the picture, without sound',
  raisePriority: 'Raise priority',
  codecFallback: '{wanted} isn’t available at this quality; {actual} will be downloaded',
  content: 'Content',
  noAudioTrack: 'This video has no separate audio track',
  codecOrder: 'Codec priority',
  audio: 'Audio quality',
  audioUnavailable: ' (not available for this video)',
  audioHint:
    '“Best”: full video prefers Dolby (lossless with MKV), audio only prefers lossless; if the chosen level isn’t available, a lower one is used automatically',
  container: 'Container',
  mp4Hint: 'Plays directly in QuickTime and on iPhone',
  mkvHint: 'Can hold lossless audio, with better compatibility for subtitles and Dolby Vision',
  watermark: 'Watermark',
  watermarkAutoHint:
    'Only applied when a watermark is detected. It re-encodes the video, so it’s much slower than just downloading; when it succeeds, only the watermark-free version is kept. HDR and Dolby Vision videos are not processed.',
  watermarkAiHint:
    'Only applied when a watermark is detected. An AI model rebuilds what’s under the watermark frame by frame, much sharper than fast removal but much slower: roughly 2–4× the video length with a GPU, slower without one. If the model can’t be downloaded or refining fails, fast removal is used instead this time. HDR and Dolby Vision videos are not processed.',
  extras: 'Extras',
  embedCover: 'Embed cover',
  cover: 'Save cover as image',
  embedSubtitle: 'Embed subtitles',
  subtitle: 'Save subtitles as .srt',
  chapters: 'Chapters (progress bar segments)',
  nfo: 'NFO metadata',
  danmaku: 'Danmaku',
  danmakuAss: 'ASS (player overlay)',
  danmakuXml: 'XML (raw)',
  nfoHint: 'Generates .nfo files that Kodi / Jellyfin / Emby can read; anime also gets a tvshow.nfo and a poster'
} satisfies Messages['options']
