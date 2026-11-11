// 解析 B站链接、取流时的报错和界面上的分组标题、音质标签
export default {
  // http.ts
  authExpired: '登录已失效，请重新登录',
  riskControl: '请求被 B站风控拦截（HTTP 412），请稍后再试',
  serverError: 'B站服务器错误（HTTP {status}）',
  networkFailed: '网络请求失败：{error}',
  wbiKeyFailed: '获取 WBI 签名密钥失败',
  badResponse: '接口返回了无法解析的内容（HTTP {status}）',
  apiError: '接口错误（{code}）',

  // 解析结果里的分组标题
  groupAudioMenu: '歌单',
  groupCourse: '课程',
  groupFav: '收藏夹',
  groupSpace: '投稿',
  groupSeason: '合集',
  groupSeries: '系列',
  groupWatchLater: '稍后再看',
  groupRank: '{label}排行',
  groupMain: '正片',
  groupStein: '互动视频剧情片段',
  groupPages: '分P',
  /** 收藏夹里已失效的视频 */
  unavailable: '已失效',

  // lists.ts、lookup.ts、resolve.ts
  spaceRejected: 'B站暂时拒绝了获取 UP 主投稿列表的请求（{error}），请稍后再试；也可以改为粘贴 UP 主的合集或收藏夹链接',
  weeklyNoNumber: '没有拿到每周必看的期数',
  captcha: 'B站要求人机验证，这次搜索没有结果',
  unrecognized: '没有识别出 B站视频、番剧、课程、收藏夹或 UP 主链接',
  batchAllFailed: '全部 {count} 个链接都解析失败：{error}',
  batchTitle: '批量解析（{count} 个来源）',

  // 排行榜分区（界面显示用）
  rankAll: '全站',
  rankDouga: '动画',
  rankMusic: '音乐',
  rankDance: '舞蹈',
  rankGame: '游戏',
  rankKnowledge: '知识',
  rankTech: '科技',
  rankSports: '运动',
  rankCar: '汽车',
  rankLife: '生活',
  rankFood: '美食',
  rankAnimal: '动物圈',
  rankKichiku: '鬼畜',
  rankFashion: '时尚',
  rankEnt: '娱乐',
  rankCinephile: '影视',
  rankOrigin: '原创',
  rankRookie: '新人',

  // 音质
  audioBest: '最佳',
  audioFlac: 'Hi-Res 无损',
  audioDolby: '杜比全景声',
  audioLossless: '无损',
  /** 任务上显示的音频画质，label 例如“320K”“无损” */
  audioQuality: '音频 {label}',
  audioNoUrl: '拿不到这首歌的下载地址',
  audioNoUrlReason: '拿不到这首歌的下载地址：{reason}',

  // danmaku.ts
  danmakuHttpFailed: '弹幕下载失败（HTTP {status}）',

  // playurl.ts
  courseNoAccess: '没有这节课的观看权限（可能需要购买）：{reason}',
  courseDrm: '这节课使用了 DRM 加密，不支持下载',
  coursePreview: '当前账号只能试看这节课（需要购买）',
  audioNotVideo: '音频不走视频取流接口',
  regionLocked: '地区限制：{reason}',
  needVip: '需要大会员：{reason}',
  drm: '该内容使用了 DRM 加密，不支持下载',
  previewOnly: '当前账号只能试看该内容（需要大会员或购买）',
  flvOnly: '该视频只有旧版 FLV 格式，暂不支持',
  noAudioTrack: '该视频没有独立音轨',
  noVideoStream: '没有可用的视频流',
  codecFallback: '该清晰度没有 {wanted}，已改用 {actual}',
  flacToMkv: 'Hi-Res 无损音轨放进 MP4 兼容性差，已改用 MKV',
  /** 画质标签里“只下画面”的标记 */
  mute: '无声'
}
