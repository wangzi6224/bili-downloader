// MCP 下载、批次、设置类工具：工具说明、参数说明和返回给 AI 的提示
import type { Messages } from '../types'

export default {
  qn: 'Quality code; the highest available quality not above it is used: 127 highest available, 120 4K, 116 1080P60, 112 1080P+, 80 1080P, 64 720P, 32 480P, 16 360P',

  // 下载选项（options / defaults 的字段）
  optOutput: 'Full video / audio only / video only (no sound)',
  optContainer: 'Video container format',
  optAudio: 'Audio quality: best picks the best automatically; if the specified level isn’t available, a lower one is used',
  optCodecOrder: 'Video codec priority, e.g. ["hevc","avc","av1"]',
  optSubtitle: 'Save subtitles separately as .srt',
  optEmbedSubtitle: 'Embed subtitles in the video file',
  optDanmaku: 'Download danmaku (bullet comments)',
  optDanmakuFormat: 'Danmaku format',
  optCover: 'Save the cover separately as an image',
  optEmbedCover: 'Embed the cover in the video / audio file',
  optChapters: 'Write the progress-bar segments as chapters',
  optNfo: 'Generate NFO metadata for Kodi / Jellyfin',
  optWatermark:
    'Watermark removal: after downloading, automatically detect the watermark in a corner of the frame and remove it (this re-encodes the video; if none is detected, or the video is HDR or Dolby Vision, the original is kept). ' +
    'auto is fast removal (fills in by interpolation, done within a few minutes, slightly blurry where the watermark was); ai repairs frame by frame with an AI model, much sharper but much slower ' +
    '(about 2–4× the video length with a GPU, slower without one; the first time, a model of about 200MB is downloaded first, and if it can’t be downloaded, fast removal is used instead). ' +
    'With off, videos are still checked for watermarks; the result is in watermark of get_batch_status, and you can remove them later with remove_watermark. Don’t pass this if the user hasn’t mentioned watermark removal',

  getStatusTitle: 'App status',
  getStatusDesc:
    'Login and Bilibili Premium status, download queue summary, total speed, download folder and free space, key settings, and any warnings that need attention. Recommended as the first call.',

  parseLinkTitle: 'Parse link',
  parseLinkDesc:
    'Parses a Bilibili link (video, collection, anime, course, favorites folder, uploader space, Watch Later, etc.); paged lists are paged through automatically. ' +
    'When there are many items, use offset / limit to read them in chunks; results are cached for 10 minutes. Item ids are stable; pass them to the ids of download_batch. ' +
    'Videos in a list (lazy) haven’t had their parts expanded yet: they are expanded automatically when added to downloads; to see the parts or download only some of them, pass expand_parts. ' +
    "downloaded='partly' on a lazy video means at least one part has been downloaded; when it’s added to downloads, each part is checked individually.",
  parseLinkUrl: 'A Bilibili link, a BV ID, or the literal keyword "稍后再看" (Watch Later), "每周必看" (Weekly Must-Watch) or "排行榜" (Rankings)',
  parseLinkMaxItems: 'Maximum number of items to fetch across pages, default {n}',
  parseLinkOffset: 'Index of the first item to return, default 0',
  parseLinkLimit: 'Number of items to return, default 100',
  parseLinkExpand: 'Expand the parts of the list videos returned this time (one request each, slower); limit is at most {n} in this case',
  parseLinkRefresh: 'Ignore the cache and parse again',

  downloadTitle: 'Batch download',
  downloadDesc:
    'Downloads Bilibili videos, collections, anime, favorites folders and more. Adds the items in a link to the download queue as one batch and immediately returns a batch_id; parts of list videos are expanded in the background. ' +
    'Use ids to choose items, or all=true to download everything; for a single-video link you can pass neither. ' +
    'When the videos to download come from different links (e.g. search results), submit them all at once with videos instead of calling once per video. Already downloaded items are skipped by default, and items already in the queue aren’t added again. ' +
    'While the original batch is unfinished, submitting the same request again returns the original batch (deduplicated=true); pass request_id to specify an idempotency key explicitly.',
  downloadUrl: 'The same link used with parse_link. Use either this or videos, not both',
  downloadVideos:
    'BV IDs, av IDs, video URLs or b23.tv short links (e.g. the url from search_videos results), combined into one batch; at most {max}, of which at most 20 can be short links and av IDs. All parts of each video are downloaded and the p parameter in links has no effect; for list links such as collections and favorites folders, use url',
  downloadBatchTitle:
    'Batch name for videos; with multiple videos it is also the name of the folder they are saved in. Default: the video’s title for one video, "N videos" for several',
  downloadIds: 'Item ids returned by parse_link (a video’s id means all of its parts)',
  downloadAll: 'Download all items (up to max_items)',
  downloadMaxItems: 'With all=true, the maximum number of items to fetch, default {n}; if it matches parse_link, its cache is used directly',
  downloadQn: '{qn}. Defaults to the quality in settings',
  downloadOptions: 'Download options; anything omitted uses the defaults from settings',
  downloadSubdir: 'Save into this subfolder of the download folder',
  downloadSkip: 'Skip items already in the download history, default true',
  downloadRequestId: 'Idempotency key: the same request_id creates only one batch',

  batchStatusTitle: 'Batch progress',
  batchStatusDesc:
    'Shows a batch’s progress: task counts by status, bytes downloaded, speed, estimated time remaining, actual quality, failure reasons and next-step hints. ' +
    'watermark describes watermark removal: the number of videos with a detected Bilibili watermark, how many have been removed, the progress of those being processed, and, if any watermarks haven’t been removed yet, how long each method would take (hint contains wording for the user). ' +
    'When wait_seconds is greater than 0, it waits until the whole batch has finished, paused or needs attention before returning (up to that long), including while watermark removal is still running; this saves polling repeatedly.',
  batchStatusWait: 'Maximum number of seconds to wait, default 0',
  batchStatusInclude: 'Extra details: failed for the failure list (default), files for paths of completed files, running for tasks currently downloading',

  listBatchesTitle: 'Recent batches',
  listBatchesDesc: 'Recently submitted batches (newest first); use it to recover a batch_id.',
  listBatchesLimit: 'Default 20',

  listTasksTitle: 'Task list',
  listTasksDesc:
    'Lists download tasks page by page, filterable by batch, status and title. Statuses: queued, running (downloading), paused, retrying (waiting to retry automatically), ' +
    'failed, unsupported (can’t be downloaded), waiting_auth (waiting for sign-in), done (completed); active means not yet finished.',
  listTasksStatus: 'One or more statuses, default all',
  listTasksQuery: 'Text contained in the title',
  listTasksLimit: 'Default 50',
  listTasksFields: 'Return only these fields',

  controlTitle: 'Control tasks in bulk',
  controlDesc:
    'Pauses, resumes, retries, redownloads or removes tasks in bulk, or cancels watermark removal. Specify the scope with task_ids, batch_id or status (at least one; they can be combined). ' +
    'When only batch_id is given (without task_ids or status), the whole batch is affected: pause / resume also applies to tasks added to the queue later, retry also retries items whose parts failed to expand, and remove stops adding items that haven’t been processed yet. ' +
    'redownload deletes what has been downloaded and starts over; remove cancels unfinished tasks and removes the tasks from the list, without deleting files that have finished downloading; ' +
    'cancel_watermark cancels watermark removal in progress (started by remove_watermark), leaving the original video unchanged.',
  controlStatus: 'Only act on tasks in these statuses',
  controlUnsupported: 'When retrying, also retry "unsupported" tasks (e.g. the user has just subscribed to Bilibili Premium)',

  removeWmTitle: 'Remove watermark',
  removeWmDesc:
    'Removes the Bilibili watermark in a corner of the frame from downloaded videos. It runs in the background and replaces the original file when done (re-encoding it). Call it only when the user explicitly asks or agrees. ' +
    'method=fast is fast removal: fills in from the surrounding picture, slightly blurry where the watermark was, and usually takes only a fraction of the video length; ' +
    'method=ai is AI refine: reconstructs what’s under the watermark frame by frame, much sharper but much slower (about 2–4× the video length with a GPU); the first time, a model of about 200MB is downloaded first, and if it can’t be downloaded or refining fails, fast removal is used instead. ' +
    'With batch_id, it processes the videos in that batch that have finished downloading, have a detected watermark and haven’t had it removed yet; with task_ids, each video is inspected individually (each one not inspected during download takes a few seconds; at most 10 are inspected per call). ' +
    'Call with dry_run=true first to get the estimated time for each video, tell the user, then make the real call. Track progress via watermark in get_batch_status or list_tasks; cancel with control_tasks action=cancel_watermark.',
  removeWmMethod: 'fast for fast removal; ai for AI refine',
  removeWmTaskIds: 'Tasks to process (must have finished downloading)',
  removeWmBatchId: 'Process the videos in this batch that have a detected watermark that hasn’t been removed yet',
  removeWmRegion:
    'Manually specify the watermark position (video pixel coordinates); can only be used with a single task_id. If the position isn’t recognized, skipped gives the video size and likely positions',
  removeWmForce: 'Process again even if the watermark has already been removed (e.g. to switch to AI refine after fast removal)',
  removeWmDryRun: 'Only detect and estimate the time; don’t start processing',

  getSettingsTitle: 'Get settings',
  getSettingsDesc:
    'Reads download-related settings: download folder, concurrency, threads per file, speed limit, auto-retry count, default quality and default download options.',

  updateSettingsTitle: 'Update settings',
  updateSettingsDesc: 'Changes download-related settings; pass only the items to change. Returns the updated settings and when each change takes effect.',
  updateDownloadDir: 'Absolute path (can start with ~/); created if it doesn’t exist',
  updateConcurrency: 'Number of tasks downloading at the same time',
  updateThreads: 'Number of connections opened per file for segmented downloading',
  updateSpeedLimit: 'Global speed limit in KB/s, 0 for unlimited',
  updateAutoRetry: 'Number of automatic retries on network errors',
  updateDefaults: 'Default download options; only the fields passed are changed',

  // 调用结果
  noSuchTool: 'No such tool: {name}',
  noSuchToolHint: 'Use tools/list to see the available tools',
  downloadDirAbsolute: 'download_dir must be an absolute path',
  downloadDirUnusable: 'Download folder unusable: {reason}',
  effectDownloadDir: 'Only affects tasks added afterward; tasks already in the queue are still saved to the original folder',
  effectConcurrency: 'Takes effect immediately: when increased, queued tasks start right away; when decreased, tasks currently downloading aren’t interrupted',
  effectThreads: 'Tasks currently downloading aren’t affected; tasks that start later or resume after pausing use the new value',
  effectNow: 'Takes effect immediately',
  effectLater: 'Only affects tasks added afterward',
  notVip:
    'Not a Bilibili Premium member: Premium qualities such as 4K and high-bitrate 1080P aren’t available; the highest downloadable quality is used automatically',
  appNotLoggedIn: 'The app is not signed in: parsing links requires sign-in. {loginHint}',
  loginUnknown: 'Can’t confirm the sign-in status right now (possibly a network problem)',
  waitingAuth: {
    one: '{count} task is waiting for sign-in and will continue automatically after signing in again. {loginHint}',
    other: '{count} tasks are waiting for sign-in and will continue automatically after signing in again. {loginHint}'
  },
  paused: {
    one: '{count} task is paused (unfinished tasks are paused automatically after the app restarts); use control_tasks action=resume to continue',
    other: '{count} tasks are paused (unfinished tasks are paused automatically after the app restarts); use control_tasks action=resume to continue'
  },
  failed: {
    one: '{count} task failed; use control_tasks action=retry status=failed to retry',
    other: '{count} tasks failed; use control_tasks action=retry status=failed to retry'
  },
  lowSpace: 'Less than 5 GB of free space left on the disk of the download folder',
  pageError: {
    one: 'An error occurred while paging ({error}); only the first {count} item was fetched. You can try again later with refresh=true',
    other: 'An error occurred while paging ({error}); only the first {count} items were fetched. You can try again later with refresh=true'
  },
  truncated: {
    one: 'Only the first {count} item was fetched; to get more, increase max_items (up to {max})',
    other: 'Only the first {count} items were fetched; to get more, increase max_items (up to {max})'
  },
  moreItems: 'Some items weren’t returned; continue reading with offset={next}',
  lazyItems: 'lazy items are videos whose parts haven’t been expanded yet; they are expanded automatically when added to downloads',
  dupResumed: 'The same request was submitted before; continued processing the items that weren’t added to the queue last time',
  dupSame:
    'The same request was submitted before, so nothing was added again; use get_batch_status batch_id={id} to check progress, or use a different request_id to resubmit',
  videosWith: 'videos and {key} can’t be used together',
  videosEmpty: 'videos can’t be empty',
  videosTooMany: 'At most {max} videos at a time; submit them in several batches',
  titleTooLong: 'title can’t be longer than {max} characters',
  videosNone: 'videos contains no downloadable videos (e.g. {examples}); for list links such as collections and favorites folders, use url',
  videosTitle: { one: '{count} video', other: '{count} videos' },
  checkProgress: 'Use get_batch_status batch_id={id} wait_seconds=30 to check progress',
  rejected: {
    one: '{count} item didn’t match any video and was ignored; see rejected',
    other: '{count} items didn’t match any video and were ignored; see rejected'
  },
  idsAndAll: 'Use either ids or all, not both',
  idsNone: 'None of the ids are in this link (e.g. {examples}); use parse_link first to see the item ids',
  pagedList: 'This is a list of {total} items; pass all=true to download everything, or choose items with ids',
  unknownIds: {
    one: '{count} id isn’t in this link and was ignored',
    other: '{count} ids aren’t in this link and were ignored'
  },
  addPageError: {
    one: 'An error occurred while paging ({error}), so only the first {count} item was added; submit again later to add the rest',
    other: 'An error occurred while paging ({error}), so only the first {count} items were added; submit again later to add the rest'
  },
  addTruncated: {
    one: 'Only the first {count} item was taken and the rest weren’t added; to get more, increase max_items (up to {max})',
    other: 'Only the first {count} items were taken and the rest weren’t added; to get more, increase max_items (up to {max})'
  },
  allDownloaded: 'All selected items have already been downloaded; to download them again, pass skip_downloaded=false',
  nothingToDownload: 'No items to download',
  controlScope: 'Specify the tasks to act on with task_ids, batch_id or status',
  notWatermarking: 'Watermark removal is not in progress',
  wrongStatus: 'Can’t {action} tasks with status {status}',
  taskIdsAndBatch: 'Use either task_ids or batch_id, not both',
  nothingToUpdate: 'No settings to change. Changeable: {names}'
} satisfies Messages['mcpTools']
