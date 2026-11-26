// 抖音网页接口返回里用到的字段（其余忽略）。作品和用户 id 超过 JS 安全整数，一律当字符串用

export interface DyUrlList {
  uri?: string
  url_list?: string[]
  width?: number
  height?: number
  data_size?: number
}

/** 一档画面：format 是 mp4（带声音的整合文件）或 dash（纯画面） */
export interface DyBitRate {
  gear_name?: string
  bit_rate?: number
  FPS?: number
  is_h265?: number
  HDR_type?: string
  format?: string
  play_addr?: DyUrlList
}

/** 单独的音轨，长视频才有 */
export interface DyAudioRate {
  audio_meta?: {
    bitrate?: number
    size?: number
    file_hash?: string
    url_list?: { main_url?: string; backup_url?: string; fallback_url?: string }
  }
}

export interface DyVideo {
  play_addr?: DyUrlList
  bit_rate?: DyBitRate[] | null
  bit_rate_audio?: DyAudioRate[] | null
  cover?: DyUrlList
  origin_cover?: DyUrlList
  width?: number
  height?: number
  /** 毫秒 */
  duration?: number
}

export interface DyImage {
  /** 无水印的图片地址；download_url_list 带水印，不用 */
  url_list?: string[]
  /** 实况图的短视频 */
  video?: DyVideo
  width?: number
  height?: number
}

export interface DyUser {
  uid?: string
  sec_uid?: string
  nickname?: string
  /** 抖音号 */
  unique_id?: string
  short_id?: string
  signature?: string
  avatar_thumb?: DyUrlList
  aweme_count?: number
  follower_count?: number
  following_count?: number
  total_favorited?: number
  favoriting_count?: number
  custom_verify?: string
  enterprise_verify_reason?: string
}

export interface DyStatistics {
  digg_count?: number
  comment_count?: number
  collect_count?: number
  share_count?: number
  /** 网页接口一直给 0 */
  play_count?: number
}

export interface DyMixInfo {
  mix_id?: string
  mix_name?: string
  desc?: string
  cover_url?: DyUrlList
  author?: DyUser
  statis?: { updated_to_episode?: number; current_episode?: number }
}

export interface DyAweme {
  aweme_id: string
  desc?: string
  create_time?: number
  /** 毫秒；图文是 0 */
  duration?: number
  /** 68 是图文 */
  aweme_type?: number
  author?: DyUser
  video?: DyVideo
  images?: DyImage[] | null
  music?: { title?: string; author?: string; play_url?: DyUrlList }
  statistics?: DyStatistics
  chapter_list?: { desc?: string; timestamp?: number }[] | null
  is_top?: number
  danmaku_control?: { danmaku_cnt?: number }
  mix_info?: DyMixInfo
  status?: { is_delete?: boolean; private_status?: number }
  text_extra?: { hashtag_name?: string }[]
  /** 从匿名分享页取到的：画质有限，下载时要用移动端的请求头 */
  fromShare?: boolean
}

export interface DyComment {
  cid: string
  text?: string
  create_time?: number
  digg_count?: number
  reply_comment_total?: number
  ip_label?: string
  user?: DyUser
}

export interface DyDanmaku {
  danmaku_id?: string
  text?: string
  /** 毫秒 */
  offset_time?: number
  digg_count?: number
}

export interface DyFolder {
  collects_id_str?: string
  collects_id?: string | number
  collects_name?: string
  total_number?: number
  collects_cover?: DyUrlList
}
