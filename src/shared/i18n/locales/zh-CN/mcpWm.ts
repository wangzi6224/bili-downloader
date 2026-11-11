// MCP 去水印：耗时估算的说法、批次里的水印提示、remove_watermark 的结果
export default {
  // 时长区间，{count} 是单个值，{lo}～{hi} 是区间
  secOne: '约 {count} 秒',
  secRange: '约 {lo}～{hi} 秒',
  minOne: '约 {count} 分钟',
  minRange: '约 {lo}～{hi} 分钟',
  hourOne: '约 {count} 小时',
  hourRange: '约 {lo}～{hi} 小时',
  // 耗时是视频时长的几倍
  ratioOne: '约 {count} 倍',
  ratioRange: '约 {lo}～{hi} 倍',

  basisMeasured: '按这台电脑实际处理过的速度',
  basisCalibrated: '按试跑的速度',
  basisDefault: '还没在这台电脑上处理过，是粗估',

  modelNote: '第一次用要先下载约 {size} MB 的 AI 模型',
  fastChoice: '快速去除{time}（用周围的画面填补，水印处会略糊）',
  fastChoiceNoTime: '快速去除（用周围的画面填补，水印处会略糊）',
  aiChoice: 'AI 精修{time}（逐帧补出水印下面的画面，清楚得多{model}）',
  aiChoiceNoTime: 'AI 精修（逐帧补出水印下面的画面，清楚得多{model}）',
  /** 接在 aiChoice 的括号里，{model} 为空时不出现 */
  aiChoiceModel: '；{note}',
  choices: '{fast}，{ai}',

  processing: '正在去水印，可以带 wait_seconds 等待，处理完后任务的 watermark.removed 为 true',
  pending:
    '{count} 个已下载的视频有 B站水印：先问用户要不要去掉，可选{choices}。' +
    '去水印会重新编码并替换原文件；用户同意后调用 remove_watermark batch_id={id} method=fast 或 method=ai',
  willDetect: '下载时会识别每个视频有没有 B站水印，结果会出现在这里',
  plannedOff: '下载时会识别有没有 B站水印，用 get_batch_status 查看；有的话可以问用户要不要用 remove_watermark 去掉',
  plannedOn: '识别到 B站水印的视频下载后会去掉水印，要重新编码',
  plannedKnown: '已知时长的视频去水印合计{time}（{basis}）',
  plannedAll: '全部视频去水印合计{time}（{basis}）',
  plannedModel: '{model}，下不下来时改用快速去除',
  speed: '{ratio}（{basis}）',
  speedBackend: '{ratio}（{basis}，{backend}）',

  regionInvalid: 'region 必须是 {x, y, w, h}，单位是视频的像素',
  regionOneTask: 'region 只能和一个任务一起用：不同视频的水印位置和尺寸可能不一样',
  tooManyTasks: '一次最多处理 {max} 个任务',
  busy: '正在处理，等它结束',
  tooManyInspect: '这次要识别的视频太多（每次最多 {max} 个），剩下的再调用一次',
  alreadyRemoved: '已经去过水印；想换一种方式重新处理（例如快速去除后换成 AI 精修），传 force=true',
  regionOutside: 'region 不在画面里或太小（视频尺寸 {size}）',
  unsure: '不确定有没有 B站水印；确认有的话，用 region 指定位置（可以用 suggested_region）',
  noRegion: '没认出水印的位置；确认有水印的话，用 region 指定位置（像素坐标）',
  total: '合计{time}（{basis}）',
  aiFallback: '{model}，下不下来或精修失败时这次改用快速去除，任务的 note 里会说明',
  dryRun: '这是预估，没有开始处理；用户同意后去掉 dry_run 再调用一次',
  started: '处理期间原视频不变，完成后替换；用 get_batch_status 或 list_tasks 查看 watermark.processing，可以用 control_tasks action=cancel_watermark 取消',
  noneSkipped: '没有可以处理的视频，原因见 skipped',
  noneEligible: '没有要处理的视频：用 batch_id 时只处理下载完、识别到水印、还没去掉的视频，别的用 task_ids 指定',
  targetsMissing: '需要用 task_ids 或 batch_id 指定要处理的视频'
}
