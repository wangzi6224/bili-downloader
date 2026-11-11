// 下载、合并、附加内容（封面、字幕、弹幕）相关的报错和提示
import type { Messages } from '../types'

export default {
  // errors.ts：文件系统错误
  diskFull: 'Not enough disk space',
  /** 拼在下面几条报错后面，指出出错的路径 */
  atPath: ': {path}',
  noWritePermission: 'No write permission{where}',
  readOnlyDisk: 'The destination disk is read-only{where}',
  dirMissing: 'The download folder doesn’t exist or the external drive is disconnected{where}',
  writeFailed: 'Failed to write file ({code}){where}',

  // extras.ts
  coverFailed: 'Cover download failed: {error}',
  noCcSubtitle: 'No CC subtitles',
  subtitleFailed: 'Failed to get subtitles/chapters: {error}',
  danmakuFailed: 'Danmaku download failed: {error}',
  coverSaveFailed: 'Failed to save cover: {error}',
  subtitleSaveFailed: 'Failed to save subtitles: {error}',
  danmakuSaveFailed: 'Failed to save danmaku: {error}',
  nfoSaveFailed: 'Failed to save NFO: {error}',
  embedFallback: 'Couldn’t write the cover/subtitles/chapters into the video, so they were saved as separate files',

  // fetchFile.ts
  sizeFailed: 'Failed to get file size (HTTP {status})',
  connectFailed: 'Failed to connect to the download server: {error}',
  timeout: 'Connection timed out',
  httpFailed: 'Download failed (HTTP {status})',
  badRange: 'The server returned the wrong data range',
  interrupted: 'Connection interrupted',
  incomplete: 'File incomplete ({done}/{total})',

  // manager.ts
  deleteFailed: { one: '{count} file couldn’t be deleted: {files}', other: '{count} files couldn’t be deleted: {files}' },
  busy: 'This video is being processed. Please wait for it to finish',
  badRegion: 'Invalid watermark area',
  fileLocked: 'The original video is in use by another program and couldn’t be replaced',

  // mux.ts：ffmpeg 报错，action 是下面三个之一
  actionMux: 'Merging',
  actionWatermark: 'Watermark removal',
  actionRead: 'Reading the video',
  ffNoSpace: '{action} failed: not enough disk space',
  ffNoPermission: '{action} failed: no permission to write to the destination folder',
  ffLogoOutside: '{action} failed: the watermark position is outside the frame',
  ffEncoder: '{action} failed: encoder unavailable',
  ffCorrupt: '{action} failed: the downloaded file is corrupted. Click “Redownload”',
  ffContainer: 'Merging failed: this codec can’t be stored in the current container format. Switch to MKV in Settings',
  ffExit: '{action} failed (ffmpeg exit code {code}): {detail}',
  ffSpawn: 'Can’t run ffmpeg: {error}',
  muxTimeout: 'Merging timed out; ffmpeg stopped responding'
} satisfies Messages['download']
