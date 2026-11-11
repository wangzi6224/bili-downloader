// 去水印（快速去除、AI 精修）相关的报错和任务提示
import type { Messages } from '../types'

export default {
  // shared/watermark.ts：水印在画面的哪个角
  cornerTopLeft: 'top-left corner',
  cornerTopRight: 'top-right corner',
  cornerBottomLeft: 'bottom-left corner',
  cornerBottomRight: 'bottom-right corner',

  // 任务提示（会存进 tasks.json）
  noteNone:
    'Watermark removal: no watermark detected, so the original video was kept (you can click “Remove watermark…” on the task to select it manually)',
  noteStatic:
    'Watermark removal: the picture changes too little to detect it automatically, so the original video was kept (you can click “Remove watermark…” on the task to select it manually)',
  noteFewFrames:
    'Watermark removal: the video is too short or too dark to detect it automatically, so the original video was kept (you can click “Remove watermark…” on the task to select it manually)',
  noteHdr: 'Watermark removal: HDR and Dolby Vision videos aren’t supported yet, so the original video was kept',
  noteInterrupted: 'Watermark removal didn’t finish (the app quit partway through), so the original video was kept',
  noteMoved: 'Watermark removal didn’t finish: the original video was moved or deleted during processing',
  noteFailed: 'Watermark removal failed: {reason}. The original video was kept',
  /** reason 本身已经是“去水印失败：…”“去水印超时：…”这样的完整说明 */
  noteFailedWhole: '{reason}. The original video was kept',
  noteAiFallback: 'Watermark removal: the AI model couldn’t be downloaded ({reason}), so fast removal was used this time',
  noteAiFailed: 'Watermark removal: AI refine couldn’t finish ({reason}), so fast removal was used this time',

  // 识别、处理
  modelNotDone: 'Download not finished',
  noVideoFrame: 'No video frame found',
  noVideoInFile: 'The file contains no video',
  hdrUnsupported: 'HDR and Dolby Vision videos aren’t supported yet',
  regionTooSmall: 'Watermark area is too small',
  taskMissing: 'Task doesn’t exist',
  notDone: 'Only videos that have finished downloading can be processed',
  audioOnly: 'This task has audio only, no video',
  fileMissing: 'Video file not found; it may have been moved or deleted',
  grabFailed: 'Couldn’t grab a frame from the video',
  previewFailed: 'Couldn’t generate a preview',
  probeFailed: 'Can’t read video info',
  probeFailedNoFile: 'Can’t read video info: the file doesn’t exist',
  ffNoResponse: 'ffmpeg isn’t responding',
  ffTooMuchOutput: 'ffmpeg produced more output than expected',
  ffStalled: 'Watermark removal timed out: ffmpeg made no progress for a long time',
  stalled: 'Watermark removal timed out: no progress for a long time',
  encoderExited: 'The encoder process exited',

  // AI 精修
  backendCoreml: 'Apple Neural Engine',
  /** 推理子进程在系统任务管理器里的名字 */
  hostServiceName: 'AI Watermark Removal',
  badInference: 'Abnormal inference result',
  noAiBackend: 'No AI inference method available ({errors})',
  modelNotLoaded: 'Model not loaded yet',
  modelNoImage: 'The model produced no image',
  hostExited: 'The inference process exited unexpectedly (code {code})',
  exitCodeUnknown: 'unknown',
  loadTimeout: 'Loading the model timed out',
  inferTimeout: 'Inference timed out',
  modelUnreachable: 'Can’t reach the model download address ({names}). Check your network or set up a proxy in Settings',
  modelChecksum: 'The downloaded model file failed verification. Please try again',
  modelMissing: 'The AI model hasn’t been downloaded yet',
  modelIncomplete: 'The model file is incomplete',
  modelBadFormat: 'Invalid model file format',
  modelBadSize: 'Invalid model size',
  modelNoGraph: 'The model file contains no computation graph',
  modelInputNotImage: 'The model’s input is not an image',
  maskSize: 'Wrong mask size',
  outputSize: 'Wrong model output size'
} satisfies Messages['wm']
