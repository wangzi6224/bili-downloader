// MCP 下载、批次、设置类工具：工具说明、参数说明和返回给 AI 的提示
export default {
  qn: '清晰度代码，会取不高于它的最高可用档：127 最高可用、120 4K、116 1080P60、112 1080P+、80 1080P、64 720P、32 480P、16 360P',

  // 下载选项（options / defaults 的字段）
  optOutput: '完整视频 / 仅音频 / 仅视频（无声）',
  optContainer: '视频封装格式',
  optAudio: '音质：best 自动选最好的，拿不到指定档位时降档',
  optCodecOrder: '视频编码优先级，例如 ["hevc","avc","av1"]',
  optSubtitle: '字幕另存为 .srt',
  optEmbedSubtitle: '字幕写进视频文件',
  optDanmaku: '下载弹幕',
  optDanmakuFormat: '弹幕格式',
  optCover: '封面另存为图片',
  optEmbedCover: '封面写进视频 / 音频文件',
  optChapters: '把进度条上的分段写成章节',
  optNfo: '生成 Kodi / Jellyfin 的 NFO 元数据',
  optWatermark:
    '去水印：下载后自动识别画面角落的水印并去掉（要重新编码视频；没识别到、HDR、杜比视界时保留原视频）。' +
    'auto 快速去除（插值填补，几分钟内完成，水印处略糊）；ai 用 AI 模型逐帧修补，清楚得多但慢很多' +
    '（有显卡时约为视频时长的 2～4 倍，没有显卡更慢；第一次会先下载约 200MB 的模型，下不下来时改用快速去除）。' +
    'off 时也会识别有没有水印，结果在 get_batch_status 的 watermark 里，之后可以用 remove_watermark 去掉。用户没提去水印时不用传',

  getStatusTitle: '应用状态',
  getStatusDesc: '登录和大会员状态、下载队列汇总、总速度、下载目录及剩余空间、主要设置，以及需要注意的提示。建议第一个调用。',

  parseLinkTitle: '解析链接',
  parseLinkDesc:
    '解析 B站链接（视频、合集、番剧、课程、收藏夹、UP 主空间、稍后再看等），分页的列表会自动翻页。' +
    '条目很多时用 offset / limit 分段读取，结果缓存 10 分钟。条目的 id 是稳定的，传给 download_batch 的 ids。' +
    '列表里的视频（lazy）还没展开分P：加入下载时会自动展开；想看分P或只下其中几P时传 expand_parts。' +
    "lazy 视频的 downloaded='partly' 表示至少有一P下载过，加入下载时会按每一P核对。",
  parseLinkUrl: 'B站链接、BV 号，或“稍后再看”“每周必看”“排行榜”',
  parseLinkMaxItems: '最多翻页取多少条，默认 {n}',
  parseLinkOffset: '从第几条开始返回，默认 0',
  parseLinkLimit: '返回多少条，默认 100',
  parseLinkExpand: '展开本次返回的列表视频的分P（逐个请求，较慢），此时 limit 最大 {n}',
  parseLinkRefresh: '忽略缓存重新解析',

  downloadTitle: '批量下载',
  downloadDesc:
    '把链接里的条目作为一个批次加入下载队列，立即返回 batch_id，列表视频的分P在后台展开。' +
    '用 ids 选条目，或 all=true 全部下载；单个视频的链接可以都不传。' +
    '要下载的视频来自不同链接（例如搜索结果）时用 videos 一次提交，不要逐个调用。已下载过的默认跳过，已在队列里的不会重复添加。' +
    '原批次还没结束时，同样的请求再提交会返回原来的批次（deduplicated=true）；传 request_id 可以明确指定幂等键。',
  downloadUrl: '和 parse_link 用的同一个链接。和 videos 只能用一个',
  downloadVideos:
    'BV 号、av 号、视频链接或 b23.tv 短链（例如 search_videos 结果里的 url），合成一个批次，最多 {max} 个，其中短链和 av 号最多 20 个。每个视频下载全部分P，链接里的 p 参数不生效；合集、收藏夹这类列表链接用 url',
  downloadBatchTitle: 'videos 的批次名，多个视频时也是保存的文件夹名。默认：一个视频用它的标题，多个用“N 个视频”',
  downloadIds: 'parse_link 返回的条目 id（视频的 id 表示它的全部分P）',
  downloadAll: '下载全部条目（最多 max_items 条）',
  downloadMaxItems: 'all=true 时最多取多少条，默认 {n}，和 parse_link 一样时直接用它的缓存',
  downloadQn: '{qn}。默认用设置里的清晰度',
  downloadOptions: '下载选项，没传的用设置里的默认值',
  downloadSubdir: '保存到下载目录下的这个子目录',
  downloadSkip: '跳过下载历史里已有的条目，默认 true',
  downloadRequestId: '幂等键：同一个 request_id 只会创建一个批次',

  batchStatusTitle: '批次进度',
  batchStatusDesc:
    '查看一个批次的进度：各状态的任务数、已下载字节、速度、预计剩余时间、实际清晰度、失败原因和下一步提示。' +
    'watermark 是去水印的情况：识别到 B站水印的视频数、已去掉的数量、正在处理的进度，以及有水印还没去掉时两种方式各要多久（hint 里有给用户的说法）。' +
    'wait_seconds 大于 0 时会等到批次全部结束、暂停或需要处理时才返回（最多等这么久），还在去水印时也会等，比反复查询省事。',
  batchStatusWait: '最多等待多少秒，默认 0',
  batchStatusInclude: '附带的明细：failed 失败列表（默认）、files 已完成的文件路径、running 正在下载的任务',

  listBatchesTitle: '最近的批次',
  listBatchesDesc: '最近提交的批次（新的在前），找回 batch_id 时用。',
  listBatchesLimit: '默认 20',

  listTasksTitle: '任务列表',
  listTasksDesc:
    '分页查看下载任务，可按批次、状态、标题筛选。状态：queued 排队、running 下载中、paused 暂停、retrying 等待自动重试、' +
    'failed 失败、unsupported 无法下载、waiting_auth 等待登录、done 完成；active 表示还没结束的。',
  listTasksStatus: '一个或多个状态，默认 all',
  listTasksQuery: '标题里包含的文字',
  listTasksLimit: '默认 50',
  listTasksFields: '只返回这些字段',

  controlTitle: '批量控制任务',
  controlDesc:
    '批量暂停、继续、重试、重新下载、移除任务，或取消去水印。用 task_ids、batch_id、status 指定范围（至少一个，可以组合）。' +
    '只指定 batch_id（不带 task_ids、status）时对整个批次操作：pause / resume 时之后才加入队列的任务也一起暂停 / 继续，retry 时也重试展开分P失败的条目，remove 时不再加入还没处理的条目。' +
    'redownload 删掉已下载的部分从头下载；remove 取消未完成的任务并把任务移出列表，已下载好的文件不会删除；' +
    'cancel_watermark 取消正在进行的去水印（remove_watermark 发起的），原视频保持不变。',
  controlStatus: '只操作这些状态的任务',
  controlUnsupported: 'retry 时也重试“无法下载”的任务（例如刚开通了大会员）',

  removeWmTitle: '去水印',
  removeWmDesc:
    '给已下载的视频去掉画面角落的 B站水印，在后台进行，完成后替换原文件（会重新编码）。只在用户明确要求或同意后调用。' +
    'method=fast 快速去除：用周围的画面填补，水印处略糊，一般只要视频时长的零点几倍；' +
    'method=ai AI 精修：逐帧补出水印下面的画面，清楚得多，但慢很多（有显卡时约为视频时长的 2～4 倍），第一次会先下载约 200MB 的模型，下不下来或精修失败时改用快速去除。' +
    '用 batch_id 时处理这个批次里下载完、识别到水印、还没去掉的视频；用 task_ids 时逐个识别（下载时没识别过的每个要几秒，一次最多识别 10 个）。' +
    '先带 dry_run=true 拿到每个视频的预计耗时，告诉用户后再正式调用。进度看 get_batch_status 或 list_tasks 的 watermark，取消用 control_tasks action=cancel_watermark。',
  removeWmMethod: 'fast 快速去除；ai AI 精修',
  removeWmTaskIds: '要处理的任务（必须已下载完成）',
  removeWmBatchId: '处理这个批次里识别到水印、还没去掉的视频',
  removeWmRegion: '手动指定水印位置（视频像素坐标），只能和一个 task_id 一起用；没认出位置时 skipped 里会给出视频尺寸和可能的位置',
  removeWmForce: '已经去过水印的也重新处理（例如快速去除后想换成 AI 精修）',
  removeWmDryRun: '只识别和估算耗时，不开始处理',

  getSettingsTitle: '读取设置',
  getSettingsDesc: '读取下载相关的设置：下载目录、并发数、每个文件的线程数、限速、自动重试次数、默认清晰度和默认下载选项。',

  updateSettingsTitle: '修改设置',
  updateSettingsDesc: '修改下载相关的设置，只需传要改的项。返回修改后的设置和每一项什么时候生效。',
  updateDownloadDir: '绝对路径（可以用 ~/ 开头），不存在会创建',
  updateConcurrency: '同时下载的任务数',
  updateThreads: '每个文件同时开几个连接分段下载',
  updateSpeedLimit: '全局限速 KB/s，0 为不限',
  updateAutoRetry: '网络错误自动重试次数',
  updateDefaults: '默认下载选项，只改传了的字段',

  // 调用结果
  noSuchTool: '没有这个工具：{name}',
  noSuchToolHint: '用 tools/list 查看可用的工具',
  downloadDirAbsolute: 'download_dir 必须是绝对路径',
  downloadDirUnusable: '下载目录不可用：{reason}',
  effectDownloadDir: '只影响之后加入的任务，已在队列里的任务仍保存到原来的目录',
  effectConcurrency: '立即生效：调高时排队的任务马上开始，调低时正在下载的任务不会被打断',
  effectThreads: '正在下载的任务不受影响；之后开始下载、暂停后继续的任务按新值分段',
  effectNow: '立即生效',
  effectLater: '只影响之后加入的任务',
  notVip: '不是大会员：4K、1080P 高码率等大会员清晰度拿不到，会自动降到能下载的最高档',
  appNotLoggedIn: '应用没有登录：解析链接需要登录。{loginHint}',
  loginUnknown: '暂时无法确认登录状态（可能是网络问题）',
  waitingAuth: '{count} 个任务在等待登录，重新登录后会自动继续。{loginHint}',
  paused: '{count} 个任务已暂停（应用重启后未完成的任务会自动暂停），可以用 control_tasks action=resume 继续',
  failed: '{count} 个任务失败，可以用 control_tasks action=retry status=failed 重试',
  lowSpace: '下载目录所在磁盘剩余空间不足 5 GB',
  pageError: '翻页时出错（{error}），只拿到前 {count} 条，过一会儿可以带 refresh=true 重试',
  truncated: '只取了前 {count} 条，需要更多请调大 max_items（最多 {max}）',
  moreItems: '还有条目没返回，用 offset={next} 继续读取',
  lazyItems: 'lazy 的条目是还没展开分P的视频，加入下载时会自动展开',
  dupResumed: '同样的请求之前提交过，已经接着处理上次没加入队列的条目',
  dupSame: '同样的请求之前提交过，没有重复添加；用 get_batch_status batch_id={id} 查看进度，要重新提交请换一个 request_id',
  videosWith: 'videos 和 {key} 不能一起用',
  videosEmpty: 'videos 不能是空的',
  videosTooMany: 'videos 一次最多 {max} 个，分成几批提交',
  titleTooLong: 'title 不能超过 {max} 个字',
  videosNone: 'videos 里没有能下载的视频（例如 {examples}），合集、收藏夹这类列表链接用 url',
  videosTitle: '{count} 个视频',
  checkProgress: '用 get_batch_status batch_id={id} wait_seconds=30 查看进度',
  rejected: '{count} 项查不到对应的视频，已忽略，见 rejected',
  idsAndAll: 'ids 和 all 只能用一个',
  idsNone: 'ids 都不在这个链接里（例如 {examples}），先用 parse_link 查看条目 id',
  pagedList: '这是一个有 {total} 条的列表，请传 all=true 下载全部，或用 ids 选择条目',
  unknownIds: '{count} 个 id 不在这个链接里，已忽略',
  addPageError: '翻页时出错（{error}），只加入了前 {count} 条；过一会儿再提交一次可以补上后面的',
  addTruncated: '只取了前 {count} 条，后面的没有加入；需要更多请调大 max_items（最多 {max}）',
  allDownloaded: '选中的条目都已经下载过；要重新下载请传 skip_downloaded=false',
  nothingToDownload: '没有可以下载的条目',
  controlScope: '需要用 task_ids、batch_id 或 status 指定要操作的任务',
  notWatermarking: '没有在去水印',
  wrongStatus: '{status} 状态的任务不能 {action}',
  taskIdsAndBatch: 'task_ids 和 batch_id 只能用一个',
  nothingToUpdate: '没有要修改的设置，可以改：{names}'
}
