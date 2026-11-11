// 解析 B站链接、取流时的报错和界面上的分组标题、音质标签
import type { Messages } from '../types'

export default {
  // http.ts
  authExpired: 'Your login is no longer valid. Please sign in again',
  riskControl: 'The request was blocked by Bilibili’s rate limiting (HTTP 412). Please try again later',
  serverError: 'Bilibili server error (HTTP {status})',
  networkFailed: 'Network request failed: {error}',
  wbiKeyFailed: 'Failed to get the WBI signing key',
  badResponse: 'The API returned a response that couldn’t be parsed (HTTP {status})',
  apiError: 'API error ({code})',

  // 解析结果里的分组标题
  groupAudioMenu: 'Playlist',
  groupCourse: 'Course',
  groupFav: 'Favorites folder',
  groupSpace: 'Uploads',
  groupSeason: 'Collection',
  groupSeries: 'Series',
  groupWatchLater: 'Watch Later',
  groupRank: 'Rankings: {label}',
  groupMain: 'Episodes',
  groupStein: 'Interactive video segments',
  groupPages: 'Parts',
  /** 收藏夹里已失效的视频 */
  unavailable: 'Unavailable',

  // lists.ts、lookup.ts、resolve.ts
  spaceRejected:
    'Bilibili temporarily refused the request for the uploader’s videos ({error}). Please try again later, or paste a link to one of the uploader’s collections or favorites folders instead',
  weeklyNoNumber: 'Couldn’t get the Weekly Must-Watch issue number',
  captcha: 'Bilibili asked for human verification, so this search returned no results',
  unrecognized: 'No Bilibili video, anime, course, favorites folder or uploader link was recognized',
  batchAllFailed: { one: '{count} link failed to parse: {error}', other: 'All {count} links failed to parse: {error}' },
  batchTitle: { one: 'Batch parse ({count} source)', other: 'Batch parse ({count} sources)' },

  // 排行榜分区（界面显示用）
  rankAll: 'All',
  rankDouga: 'Animation',
  rankMusic: 'Music',
  rankDance: 'Dance',
  rankGame: 'Gaming',
  rankKnowledge: 'Knowledge',
  rankTech: 'Tech',
  rankSports: 'Sports',
  rankCar: 'Cars',
  rankLife: 'Life',
  rankFood: 'Food',
  rankAnimal: 'Animals',
  rankKichiku: 'Kichiku',
  rankFashion: 'Fashion',
  rankEnt: 'Entertainment',
  rankCinephile: 'Film & TV',
  rankOrigin: 'Original',
  rankRookie: 'Newcomers',

  // 音质
  audioBest: 'Best',
  audioFlac: 'Hi-Res Lossless',
  audioDolby: 'Dolby Atmos',
  audioLossless: 'Lossless',
  /** 任务上显示的音频画质，label 例如“320K”“无损” */
  audioQuality: 'Audio {label}',
  audioNoUrl: 'Couldn’t get the download URL for this track',
  audioNoUrlReason: 'Couldn’t get the download URL for this track: {reason}',

  // danmaku.ts
  danmakuHttpFailed: 'Danmaku download failed (HTTP {status})',

  // playurl.ts
  courseNoAccess: 'You don’t have access to this lesson (it may need to be purchased): {reason}',
  courseDrm: 'This lesson is DRM-protected and can’t be downloaded',
  coursePreview: 'This account can only preview this lesson (purchase required)',
  audioNotVideo: 'Audio doesn’t use the video stream API',
  regionLocked: 'Region restricted: {reason}',
  needVip: 'Bilibili Premium required: {reason}',
  drm: 'This content is DRM-protected and can’t be downloaded',
  previewOnly: 'This account can only preview this content (Bilibili Premium or purchase required)',
  flvOnly: 'This video is only available in the old FLV format, which isn’t supported yet',
  noAudioTrack: 'This video has no separate audio track',
  noVideoStream: 'No video stream available',
  codecFallback: '{wanted} isn’t available at this quality; using {actual} instead',
  flacToMkv: 'Hi-Res lossless audio has poor compatibility in MP4, so MKV is used instead',
  /** 画质标签里“只下画面”的标记 */
  mute: 'No audio'
} satisfies Messages['bili']
