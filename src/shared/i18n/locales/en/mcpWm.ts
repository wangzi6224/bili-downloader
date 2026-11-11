// MCP 去水印：耗时估算的说法、批次里的水印提示、remove_watermark 的结果
import type { Messages } from '../types'

export default {
  // 时长区间，{count} 是单个值，{lo}～{hi} 是区间
  secOne: { one: 'about {count} second', other: 'about {count} seconds' },
  secRange: 'about {lo}–{hi} seconds',
  minOne: { one: 'about {count} minute', other: 'about {count} minutes' },
  minRange: 'about {lo}–{hi} minutes',
  hourOne: { one: 'about {count} hour', other: 'about {count} hours' },
  hourRange: 'about {lo}–{hi} hours',
  // 耗时是视频时长的几倍
  ratioOne: 'about {count}× the video length',
  ratioRange: 'about {lo}–{hi}× the video length',

  basisMeasured: 'based on the actual processing speed on this computer',
  basisCalibrated: 'based on the speed of a test run',
  basisDefault: 'nothing has been processed on this computer yet, so this is a rough estimate',

  modelNote: 'First use requires downloading an AI model of about {size} MB',
  fastChoice: 'Fast removal, {time} (fills in from the surrounding picture; slightly blurry where the watermark was)',
  fastChoiceNoTime: 'Fast removal (fills in from the surrounding picture; slightly blurry where the watermark was)',
  aiChoice: 'AI refine, {time} (reconstructs what’s under the watermark frame by frame, much sharper{model})',
  aiChoiceNoTime: 'AI refine (reconstructs what’s under the watermark frame by frame, much sharper{model})',
  /** 接在 aiChoice 的括号里，{model} 为空时不出现 */
  aiChoiceModel: '; {note}',
  choices: '{fast}; {ai}',

  processing: 'Removing watermarks. You can wait with wait_seconds; when processing is done, the task’s watermark.removed is true',
  pending: {
    one:
      '{count} downloaded video has a Bilibili watermark: first ask the user whether to remove it. Options: {choices}. ' +
      'Watermark removal re-encodes and replaces the original file; once the user agrees, call remove_watermark batch_id={id} method=fast or method=ai',
    other:
      '{count} downloaded videos have a Bilibili watermark: first ask the user whether to remove it. Options: {choices}. ' +
      'Watermark removal re-encodes and replaces the original file; once the user agrees, call remove_watermark batch_id={id} method=fast or method=ai'
  },
  willDetect: 'Each video is checked for a Bilibili watermark while downloading; the results will appear here',
  plannedOff:
    'Videos are checked for a Bilibili watermark while downloading; see get_batch_status. If any have one, you can ask the user whether to remove it with remove_watermark',
  plannedOn: 'Videos with a detected Bilibili watermark will have it removed after downloading, which requires re-encoding',
  plannedKnown: 'Watermark removal for the videos with a known duration takes {time} in total ({basis})',
  plannedAll: 'Watermark removal for all videos takes {time} in total ({basis})',
  plannedModel: '{model}; if it can’t be downloaded, fast removal is used instead',
  speed: '{ratio} ({basis})',
  speedBackend: '{ratio} ({basis}, {backend})',

  regionInvalid: 'region must be {x, y, w, h}, in video pixels',
  regionOneTask: 'region can only be used with a single task: the watermark position and size may differ between videos',
  tooManyTasks: 'At most {max} tasks at a time',
  busy: 'Processing; wait for it to finish',
  tooManyInspect: 'Too many videos to inspect this time (at most {max} per call); call again for the rest',
  alreadyRemoved:
    'The watermark has already been removed; to reprocess with a different method (e.g. switch to AI refine after fast removal), pass force=true',
  regionOutside: 'region is outside the frame or too small (video size {size})',
  unsure: 'Not sure whether there is a Bilibili watermark; if you confirm there is one, specify its position with region (you can use suggested_region)',
  noRegion: 'The watermark position wasn’t recognized; if you confirm there is a watermark, specify its position with region (pixel coordinates)',
  total: '{time} in total ({basis})',
  aiFallback: '{model}; if it can’t be downloaded or refining fails, fast removal is used instead this time, and the task’s note will say so',
  dryRun: 'This is an estimate; processing hasn’t started. Once the user agrees, call again without dry_run',
  started:
    'The original video stays unchanged during processing and is replaced when done; check watermark.processing with get_batch_status or list_tasks, and cancel with control_tasks action=cancel_watermark',
  noneSkipped: 'No videos can be processed; see skipped for the reasons',
  noneEligible:
    'No videos to process: with batch_id, only videos that have finished downloading, have a detected watermark and haven’t had it removed yet are processed; specify others with task_ids',
  targetsMissing: 'Specify the videos to process with task_ids or batch_id'
} satisfies Messages['mcpWm']
