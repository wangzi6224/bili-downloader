// 去水印（快速去除、AI 精修）相关的报错和任务提示
export default {
  // shared/watermark.ts：水印在画面的哪个角
  cornerTopLeft: '左上角',
  cornerTopRight: '右上角',
  cornerBottomLeft: '左下角',
  cornerBottomRight: '右下角',

  // 任务提示（会存进 tasks.json）
  noteNone: '去水印：没有识别到水印，已保留原视频（可以在任务上点“去水印…”手动框选）',
  noteStatic: '去水印：画面变化太少，没法自动识别，已保留原视频（可以在任务上点“去水印…”手动框选）',
  noteFewFrames: '去水印：视频太短或画面太暗，没法自动识别，已保留原视频（可以在任务上点“去水印…”手动框选）',
  noteHdr: '去水印：暂不支持 HDR 和杜比视界视频，已保留原视频',
  noteInterrupted: '去水印没有完成（应用中途退出了），已保留原视频',
  noteMoved: '去水印没有完成：处理期间原视频被移动或删除了',
  noteFailed: '去水印失败：{reason}，已保留原视频',
  /** reason 本身已经是“去水印失败：…”“去水印超时：…”这样的完整说明 */
  noteFailedWhole: '{reason}，已保留原视频',
  noteAiFallback: '去水印：AI 模型没能下载（{reason}），这次改用了快速去除',
  noteAiFailed: '去水印：AI 精修没能完成（{reason}），这次改用了快速去除',

  // 识别、处理
  modelNotDone: '下载没有完成',
  noVideoFrame: '没找到视频画面',
  noVideoInFile: '文件里没有视频画面',
  hdrUnsupported: '暂不支持 HDR 和杜比视界视频',
  regionTooSmall: '水印区域太小',
  taskMissing: '任务不存在',
  notDone: '只能处理已经下载完成的视频',
  audioOnly: '这个任务只有音频，没有画面',
  fileMissing: '找不到视频文件，可能已被移动或删除',
  grabFailed: '没能从视频里取出画面',
  previewFailed: '没能生成预览画面',
  probeFailed: '无法读取视频信息',
  probeFailedNoFile: '无法读取视频信息：文件不存在',
  ffNoResponse: 'ffmpeg 没有响应',
  ffTooMuchOutput: 'ffmpeg 输出的数据超出预期',
  ffStalled: '去水印超时：ffmpeg 长时间没有进展',
  stalled: '去水印超时：长时间没有进展',
  encoderExited: '编码进程已退出',

  // AI 精修
  backendCoreml: 'Apple 神经引擎',
  /** 推理子进程在系统任务管理器里的名字 */
  hostServiceName: 'AI 去水印',
  badInference: '推理结果异常',
  noAiBackend: '没有可用的 AI 推理方式（{errors}）',
  modelNotLoaded: '模型还没加载',
  modelNoImage: '模型没有输出图像',
  hostExited: '推理进程意外退出（代码 {code}）',
  exitCodeUnknown: '未知',
  loadTimeout: '加载模型超时',
  inferTimeout: '推理超时',
  modelUnreachable: '连不上模型的下载地址（{names}），请检查网络或在设置里配置代理',
  modelChecksum: '下载的模型文件校验不通过，请重试',
  modelMissing: '还没有下载 AI 模型',
  modelIncomplete: '模型文件不完整',
  modelBadFormat: '模型文件格式不对',
  modelBadSize: '模型尺寸无效',
  modelNoGraph: '模型文件里没有计算图',
  modelInputNotImage: '模型的输入不是图像',
  maskSize: '掩码尺寸不对',
  outputSize: '模型输出的尺寸不对'
}
