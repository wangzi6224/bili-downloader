// yt-dlp -J 输出里用到的字段（其余字段原样保留在对象里，下载时整份交回给 --load-info-json）

export interface YtFormat {
  format_id: string
  ext: string
  vcodec?: string | null
  acodec?: string | null
  height?: number | null
  width?: number | null
  fps?: number | null
  tbr?: number | null
  abr?: number | null
  vbr?: number | null
  filesize?: number | null
  filesize_approx?: number | null
  protocol?: string
  dynamic_range?: string | null
  language?: string | null
  language_preference?: number | null
  format_note?: string | null
  has_drm?: boolean
}

export interface YtSubtitle {
  ext: string
  name?: string
}

export interface YtChapter {
  start_time: number
  end_time: number
  title: string
}

export interface YtThumbnail {
  url: string
  width?: number
  height?: number
}

export interface YtVideoInfo {
  id: string
  title: string
  description?: string | null
  channel?: string | null
  channel_id?: string | null
  channel_url?: string | null
  uploader?: string | null
  uploader_id?: string | null
  timestamp?: number | null
  release_timestamp?: number | null
  upload_date?: string | null
  duration?: number | null
  view_count?: number | null
  like_count?: number | null
  comment_count?: number | null
  live_status?: string | null
  availability?: string | null
  age_limit?: number | null
  categories?: string[] | null
  tags?: string[] | null
  webpage_url?: string
  thumbnail?: string | null
  thumbnails?: YtThumbnail[] | null
  chapters?: YtChapter[] | null
  formats?: YtFormat[]
  subtitles?: Record<string, YtSubtitle[]> | null
  automatic_captions?: Record<string, YtSubtitle[]> | null
  language?: string | null
  _type?: string
}

/** --flat-playlist 里的一项：视频，或频道“播放列表”页里的播放列表 */
export interface YtFlatEntry {
  _type?: string
  ie_key?: string
  id: string
  url?: string
  title?: string | null
  description?: string | null
  duration?: number | null
  view_count?: number | null
  channel?: string | null
  channel_id?: string | null
  channel_url?: string | null
  uploader?: string | null
  uploader_id?: string | null
  timestamp?: number | null
  release_timestamp?: number | null
  live_status?: string | null
  availability?: string | null
  thumbnails?: YtThumbnail[] | null
  channel_follower_count?: number | null
  playlist_count?: number | null
}

export interface YtPlaylistInfo {
  id: string
  title?: string | null
  description?: string | null
  channel?: string | null
  channel_id?: string | null
  uploader?: string | null
  uploader_id?: string | null
  playlist_count?: number | null
  webpage_url?: string
  thumbnails?: YtThumbnail[] | null
  channel_follower_count?: number | null
  view_count?: number | null
  entries?: YtFlatEntry[]
  _type?: string
}
