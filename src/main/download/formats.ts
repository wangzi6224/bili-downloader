/** 成品的格式 */
export type OutFormat = 'mp4' | 'mkv' | 'm4a' | 'flac' | 'webm' | 'opus'

/** 能把封面写进文件的格式（WebM、Opus 不行，封面改为单独保存） */
export const canEmbedCover = (f: OutFormat): boolean => f !== 'webm' && f !== 'opus'
