import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import { writeTextAtomic } from '../store'

/**
 * 装进 agent 的 skill（一个带 SKILL.md 的目录）。description 决定 agent 什么时候想到它，
 * 所以把中英文的常见说法都写进去，不随界面语言变；正文按界面语言生成，流程和 MCP 的 instructions 一致。
 */

export const SKILL_NAME = 'bili-downloader'
const GENERATOR = 'bili-downloader'

export const SKILL_DESCRIPTION =
  'B站（哔哩哔哩 / bilibili）视频下载、搜索和内容查看，通过本机的 B站下载器（bili-downloader MCP 服务）完成。' +
  '用户想下载 B站视频、合集、分P、收藏夹、稍后再看、UP主投稿、番剧、电影、纪录片或音频，' +
  '提到 B站下载、B站下载器、下载B站视频、B站视频下载、保存或批量下载 B站视频，' +
  '或者给出 bilibili.com、b23.tv 链接、BV号、av号、ep号、ss号时，优先使用本技能。' +
  '也用于 B站搜索：搜B站视频、找UP主、找最好 / 最热 / 最新 / 值得看 / 推荐的视频、按播放量 / 评论数 / 时长 / 弹幕数 / 发布时间排序、看视频详情和播放量、AI 总结、字幕、章节、评论，以及查看下载进度、失败重试、去水印、登录 B站账号。' +
  ' Use it for Bilibili video download (bilibili downloader, download bilibili videos, BV ids, b23.tv links),' +
  ' Bilibili search (find the best / most viewed / newest videos, sort by views, comments, duration, danmaku or date), uploaders, subtitles, AI summaries and comments.'

/** YouTube 单独一个 skill：description 里只写 YouTube 的说法，agent 遇到 YouTube 的请求更容易想到它 */
export const YT_SKILL_NAME = 'youtube-downloader'

export const YT_SKILL_DESCRIPTION =
  'YouTube 视频下载、搜索和内容查看，通过本机的 B站下载器（bili-downloader MCP 服务，youtube_* 工具）完成。' +
  '用户想下载 YouTube / 油管视频、Shorts、播放列表、频道视频、YouTube Music、直播回放、稍后观看或喜欢的视频，' +
  '提到 YouTube 下载、油管下载、下载 YouTube 视频、保存 YouTube 视频或字幕，或者给出 youtube.com、youtu.be、music.youtube.com 链接时，优先使用本技能。' +
  '也用于 YouTube 搜索视频和频道、看视频详情、字幕全文、章节、评论，以及查看下载进度、失败重试、导入 YouTube 登录。' +
  ' Use it for YouTube video download (youtube downloader, download YouTube videos, Shorts, playlists, channels, YouTube Music, youtu.be links),' +
  ' YouTube search (videos, channels, sort by date / views / rating), video details, transcripts, chapters and comments.'

/** 抖音单独一个 skill：description 里只写抖音的说法 */
export const DY_SKILL_NAME = 'douyin-downloader'

export const DY_SKILL_DESCRIPTION =
  '抖音视频下载、搜索和内容查看，通过本机的 B站下载器（bili-downloader MCP 服务，douyin_* 工具）完成。' +
  '用户想下载抖音视频、图文作品、实况图、合集、短剧、博主主页的作品、喜欢或收藏，提到抖音下载、下载抖音视频、无水印下载、保存抖音，' +
  '或者给出 douyin.com、v.douyin.com、iesdouyin.com 链接和“复制打开抖音”这类分享口令时，优先使用本技能。' +
  '也用于抖音搜索视频和博主、看作品详情、章节、评论，以及查看下载进度、失败重试、登录抖音、完成安全验证。抖音没有字幕和 AI 总结。' +
  ' Use it for Douyin (Chinese TikTok) downloads: videos, photo posts, collections, creator pages, v.douyin.com share links,' +
  ' Douyin search (videos and creators), post details and comments.'

/** 主 skill 以外、按平台单独写的 skill */
const PLATFORM_SKILLS: { name: string; markdown: (version: string) => string }[] = [
  { name: YT_SKILL_NAME, markdown: (version) => ytSkillMarkdown(version) },
  { name: DY_SKILL_NAME, markdown: (version) => dySkillMarkdown(version) }
]

export const SKILL_NAMES: readonly string[] = [SKILL_NAME, ...PLATFORM_SKILLS.map((s) => s.name)]

export function dySkillMarkdown(version: string): string {
  const appName = t('common.appName')
  return [
    '---',
    `name: ${DY_SKILL_NAME}`,
    `description: ${JSON.stringify(DY_SKILL_DESCRIPTION)}`,
    'metadata:',
    `  generator: ${GENERATOR}`,
    `  version: ${JSON.stringify(version)}`,
    '---',
    '',
    `# ${appName} · Douyin`,
    '',
    t('agents.dySkillIntro', { appName }),
    '',
    `## ${t('agents.skillWorkflow')}`,
    '',
    t('mcpDouyin.instructions'),
    '',
    `## ${t('agents.skillTroubleshoot')}`,
    '',
    t('agents.dySkillTroubleshootBody'),
    ''
  ].join('\n')
}

export function ytSkillMarkdown(version: string): string {
  const appName = t('common.appName')
  return [
    '---',
    `name: ${YT_SKILL_NAME}`,
    `description: ${JSON.stringify(YT_SKILL_DESCRIPTION)}`,
    'metadata:',
    `  generator: ${GENERATOR}`,
    `  version: ${JSON.stringify(version)}`,
    '---',
    '',
    `# ${appName} · YouTube`,
    '',
    t('agents.ytSkillIntro', { appName }),
    '',
    `## ${t('agents.skillWorkflow')}`,
    '',
    t('mcpYoutube.instructions'),
    '',
    `## ${t('agents.skillTroubleshoot')}`,
    '',
    t('agents.ytSkillTroubleshootBody'),
    ''
  ].join('\n')
}

export function skillMarkdown(version: string): string {
  const appName = t('common.appName')
  return [
    '---',
    `name: ${SKILL_NAME}`,
    // 用 JSON 字符串写，YAML 能直接读，不用担心冒号、引号
    `description: ${JSON.stringify(SKILL_DESCRIPTION)}`,
    'metadata:',
    `  generator: ${GENERATOR}`,
    `  version: ${JSON.stringify(version)}`,
    '---',
    '',
    `# ${appName}`,
    '',
    t('agents.skillIntro', { appName }),
    '',
    `## ${t('agents.skillWorkflow')}`,
    '',
    t('mcp.instructions', { appName }),
    t('mcpAccounts.instructions'),
    '',
    `## ${t('agents.skillSearch')}`,
    '',
    t('agents.skillSearchBody'),
    '',
    `## ${t('agents.skillTroubleshoot')}`,
    '',
    t('agents.skillTroubleshootBody', { appName }),
    ''
  ].join('\n')
}

const skillFile = (root: string, name: string = SKILL_NAME): string => join(root, name, 'SKILL.md')

/**
 * 已装的 skill 的版本：没有这个目录返回 undefined；有但不是我们生成的（用户自己放的同名 skill）返回 null。
 * 缺省看主 skill（bili-downloader），两个 skill 总是一起写
 */
export function installedSkillVersion(root: string, name: string = SKILL_NAME): string | null | undefined {
  let text: string
  try {
    text = readFileSync(skillFile(root, name), 'utf8')
  } catch {
    return existsSync(join(root, name)) ? null : undefined
  }
  if (!new RegExp(`^\\s*generator:\\s*${GENERATOR}\\s*$`, 'm').test(text)) return null
  const m = /^\s*version:\s*"?([^"\s]+)"?\s*$/m.exec(text)
  return m ? m[1] : ''
}

export function writeSkill(root: string, version: string): void {
  writeTextAtomic(skillFile(root), skillMarkdown(version))
  for (const { name, markdown } of PLATFORM_SKILLS) {
    // 用户自己放了同名的 skill 就不覆盖
    if (installedSkillVersion(root, name) !== null) writeTextAtomic(skillFile(root, name), markdown(version))
  }
}

/** 只删我们生成的；返回主 skill 是否删了 */
export function removeSkill(root: string): boolean {
  for (const { name } of PLATFORM_SKILLS) {
    if (typeof installedSkillVersion(root, name) === 'string') rmSync(join(root, name), { recursive: true, force: true })
  }
  const v = installedSkillVersion(root)
  if (v === undefined || v === null) return false
  rmSync(join(root, SKILL_NAME), { recursive: true, force: true })
  return true
}
