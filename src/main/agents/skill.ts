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
  '也用于 B站搜索：搜B站视频、找UP主、看视频详情和播放量、AI 总结、字幕、章节、评论，以及查看下载进度、失败重试、去水印、登录 B站账号。' +
  ' Use it for Bilibili video download (bilibili downloader, download bilibili videos, BV ids, b23.tv links),' +
  ' Bilibili search, uploaders, subtitles, AI summaries and comments.'

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
    `## ${t('agents.skillTroubleshoot')}`,
    '',
    t('agents.skillTroubleshootBody', { appName }),
    ''
  ].join('\n')
}

const skillFile = (root: string): string => join(root, SKILL_NAME, 'SKILL.md')

/**
 * 已装的 skill 的版本：没有这个目录返回 undefined；有但不是我们生成的（用户自己放的同名 skill）返回 null
 */
export function installedSkillVersion(root: string): string | null | undefined {
  let text: string
  try {
    text = readFileSync(skillFile(root), 'utf8')
  } catch {
    return existsSync(join(root, SKILL_NAME)) ? null : undefined
  }
  if (!new RegExp(`^\\s*generator:\\s*${GENERATOR}\\s*$`, 'm').test(text)) return null
  const m = /^\s*version:\s*"?([^"\s]+)"?\s*$/m.exec(text)
  return m ? m[1] : ''
}

export function writeSkill(root: string, version: string): void {
  writeTextAtomic(skillFile(root), skillMarkdown(version))
}

/** 只删我们生成的；返回是否删了 */
export function removeSkill(root: string): boolean {
  const v = installedSkillVersion(root)
  if (v === undefined || v === null) return false
  rmSync(join(root, SKILL_NAME), { recursive: true, force: true })
  return true
}
