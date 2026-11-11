import type { Messages } from '../types'

export default {
  lessThanMinute: 'less than a minute',
  aboutMinutes: { one: 'about {count} minute', other: 'about {count} minutes' },
  aboutMinutesRange: 'about {min}–{max} minutes',
  aboutHours: { one: 'about {count} hour', other: 'about {count} hours' },
  aboutHoursRange: 'about {min}–{max} hours',
  estimate: 'Estimated {range} · using {device}',
  hintCpu: 'GPU acceleration isn’t available on this computer, so only the CPU can be used. This will be fairly slow.',
  hintReuse: 'Static parts of the picture are reused as-is (about {pct}% of frames).',
  hintFallback: 'The watermark’s strokes weren’t recognized, so the whole box will be redrawn. Results may not be as good as expected.',
  modelReady: 'AI model ready',
  modelVerifying: 'Verifying model…',
  modelDownloading: 'Downloading AI model {pct}% ({done} / {size})',
  modelDownloadingFrom: 'Downloading AI model from {source} {pct}% ({done} / {size})',
  modelFailed: 'Model download failed: {message}',
  unknownReason: 'unknown reason',
  modelMissing: 'AI refine needs to download a model first ({size}, one time only)',
  settingsReady: 'Downloaded. Used when “AI refine” is chosen for watermark removal; if you delete it, it will have to be downloaded again.',
  settingsReadyDisk:
    'Downloaded, taking up {disk} including cache. Used when “AI refine” is chosen for watermark removal; if you delete it, it will have to be downloaded again.',
  settingsNeeded: 'Needed when “AI refine” is chosen for watermark removal. Downloaded the first time it’s used ({size}).',
  settingsNeededPartial:
    'Needed when “AI refine” is chosen for watermark removal. Downloaded the first time it’s used ({size}); the unfinished download takes up {disk}.',
  settingsError: '{error}. Needed when “AI refine” is chosen for watermark removal. Downloaded the first time it’s used ({size}).',
  speedRatio: 'about {count}× the video length',
  speedRatioRange: 'about {min}–{max}× the video length',
  basisMeasured: 'measured on this computer',
  basisCalibrated: 'estimated from a test run',
  basisRough: 'rough estimate',
  modeOff: 'Off',
  modeOffHint: 'Keep the original video without re-encoding',
  modeAuto: 'Fast removal',
  modeAutoHint: 'Fills in from the surrounding picture; slightly blurry where the watermark was',
  modeAi: 'AI refine',
  modeAiHint: 'Uses an AI model to rebuild what’s under the watermark frame by frame; much sharper',
  hintWithSpeed: '{hint}; {speed}'
} satisfies Messages['aiRefine']
