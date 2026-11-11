import type { Messages } from '../types'

export default {
  methodFast: 'Fast',
  methodFastHint: 'Fills in from the surrounding picture. Done within minutes, but the watermark area will be a bit blurry',
  methodAi: 'AI refine',
  methodAiHint: 'An AI model rebuilds what’s under the watermark frame by frame. Much sharper, but slow',
  title: 'Remove watermark',
  subtitle:
    'Drag the box over the watermark, and drag its corners and edges to resize it. Processing re-encodes the video and replaces the original file when done.',
  alreadyApplied: 'The watermark has already been removed from this video once. Processing it again means another re-encode, with a slight loss of quality.',
  detected: 'Watermark detected in the {corner}. You can still adjust the box.',
  notDetected: 'No watermark was detected automatically. Drag the box over the watermark.',
  frameAlt: 'Video frame',
  regionLabel: 'Watermark area. Use the arrow keys to move it; hold Shift to move 10 pixels at a time',
  detecting: 'Detecting watermark…',
  nextFrame: 'Another frame',
  showOriginal: 'Show original',
  preview: 'Preview',
  reset: 'Reset',
  cancel: 'Cancel',
  retry: 'Retry',
  downloadModel: 'Download model',
  estimating: 'Estimating time (the first time loads the model and test-runs a few frames, which takes 10–20 seconds)…',
  startAi: 'Start AI refine',
  start: 'Start'
} satisfies Messages['wmDialog']
