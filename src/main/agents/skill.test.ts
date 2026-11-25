import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLanguage } from '@shared/i18n'
import { installedSkillVersion, removeSkill, SKILL_DESCRIPTION, SKILL_NAMES, skillMarkdown, writeSkill, YT_SKILL_DESCRIPTION, YT_SKILL_NAME, ytSkillMarkdown } from './skill'

let root: string
beforeEach(() => (root = mkdtempSync(join(tmpdir(), 'skill-'))))
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** 按 YAML 的规矩取出 frontmatter 里的 description（这里是 JSON 字符串） */
const frontmatter = (md: string): Record<string, string> =>
  Object.fromEntries(
    md
      .split('---')[1]
      .trim()
      .split('\n')
      .filter((l) => /^\w+:\s*\S/.test(l))
      .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()])
  )

describe('skill 内容', () => {
  it('description 不超过 1024 字符，常见的中英文说法都在里面', () => {
    expect(SKILL_DESCRIPTION.length).toBeLessThanOrEqual(1024)
    for (const word of ['B站下载', 'B站下载器', '下载B站视频', 'B站视频下载', 'B站搜索', '搜B站视频', 'UP主', 'BV号', 'b23.tv', 'bilibili', 'Bilibili video download', 'Bilibili search', '找最好', '推荐的视频', '按播放量', 'sort by views']) {
      expect(SKILL_DESCRIPTION).toContain(word)
    }
  })

  it('frontmatter 合法，带名称、描述和版本；正文按界面语言', () => {
    const md = skillMarkdown('1.2.3')
    const fm = frontmatter(md)
    expect(fm.name).toBe('bili-downloader')
    expect(JSON.parse(fm.description)).toBe(SKILL_DESCRIPTION)
    expect(md).toContain('  version: "1.2.3"')
    expect(md).toContain('download_batch')
    expect(md).toContain('B站下载器 > 设置 > AI 助手')
    setLanguage('en')
    try {
      expect(skillMarkdown('1.2.3')).toContain('Settings > AI assistants')
    } finally {
      setLanguage('zh-CN')
    }
  })
})

describe('搜索选片', () => {
  it('skill 里有“搜索选片”一节，在使用流程之后、排障之前；MCP 说明里也点名 quality', () => {
    const md = skillMarkdown('1.2.3')
    const at = (h: string): number => md.indexOf(`## ${h}`)
    expect(at('搜索选片')).toBeGreaterThan(at('使用流程'))
    expect(at('搜索选片')).toBeLessThan(at('工具用不了时'))
    expect(md).toContain('order=quality')
    expect(md).toContain('get_video_transcript')
    expect(md).toContain('检索选片')
  })

  it('每种语言都有这一节', () => {
    try {
      setLanguage('en')
      expect(skillMarkdown('1.2.3')).toContain('## Picking videos')
    } finally {
      setLanguage('zh-CN')
    }
  })
})

describe('安装和识别', () => {
  it('没有、我们生成的、用户自己的三种情况', () => {
    expect(installedSkillVersion(root)).toBeUndefined()
    writeSkill(root, '1.0.0')
    expect(installedSkillVersion(root)).toBe('1.0.0')
    writeSkill(root, '1.1.0')
    expect(installedSkillVersion(root)).toBe('1.1.0')
    expect(readFileSync(join(root, 'bili-downloader', 'SKILL.md'), 'utf8')).toContain('1.1.0')

    writeFileSync(join(root, 'bili-downloader', 'SKILL.md'), '---\nname: bili-downloader\n---\n')
    expect(installedSkillVersion(root)).toBeNull()
    expect(removeSkill(root)).toBe(false)
    // 目录在但没有 SKILL.md，也不是我们的
    rmSync(join(root, 'bili-downloader', 'SKILL.md'))
    expect(installedSkillVersion(root)).toBeNull()
    // 我们的标记在但没写版本
    writeFileSync(join(root, 'bili-downloader', 'SKILL.md'), '---\nmetadata:\n  generator: bili-downloader\n---\n')
    expect(installedSkillVersion(root)).toBe('')
  })

  it('只删我们生成的', () => {
    expect(removeSkill(root)).toBe(false)
    writeSkill(root, '1.0.0')
    mkdirSync(join(root, 'other'))
    expect(removeSkill(root)).toBe(true)
    expect(installedSkillVersion(root)).toBeUndefined()
  })
})

describe('YouTube skill', () => {
  const ytFile = (): string => join(root, 'youtube-downloader', 'SKILL.md')

  it('description 不超过 1024 字符，YouTube 的常见说法都在里面', () => {
    expect(YT_SKILL_DESCRIPTION.length).toBeLessThanOrEqual(1024)
    for (const word of ['YouTube 下载', '油管', 'Shorts', 'youtu.be', 'youtube_*', 'download YouTube videos', 'transcripts']) {
      expect(YT_SKILL_DESCRIPTION).toContain(word)
    }
    expect(SKILL_NAMES).toEqual(['bili-downloader', 'youtube-downloader'])
  })

  it('frontmatter 合法，带名称、描述、生成者和版本；正文是 YouTube 的流程和排障', () => {
    const md = ytSkillMarkdown('2.0.0')
    const fm = frontmatter(md)
    expect(fm.name).toBe(YT_SKILL_NAME)
    expect(JSON.parse(fm.description)).toBe(YT_SKILL_DESCRIPTION)
    expect(md).toContain('  generator: bili-downloader')
    expect(md).toContain('  version: "2.0.0"')
    expect(md).toContain('# B站下载器 · YouTube')
    expect(md).toContain('## 使用流程')
    expect(md).toContain('## 工具用不了时')
    expect(md).toContain('youtube_update_engine')
    expect(md).toContain('youtube_download_batch')
    setLanguage('en')
    try {
      expect(ytSkillMarkdown('2.0.0')).not.toContain('## 使用流程')
    } finally {
      setLanguage('zh-CN')
    }
  })

  it('两个 skill 一起写入、一起删除', () => {
    writeSkill(root, '1.0.0')
    expect(installedSkillVersion(root, YT_SKILL_NAME)).toBe('1.0.0')
    expect(readFileSync(ytFile(), 'utf8')).toContain('name: youtube-downloader')
    writeSkill(root, '1.1.0')
    expect(installedSkillVersion(root, YT_SKILL_NAME)).toBe('1.1.0')
    expect(removeSkill(root)).toBe(true)
    expect(installedSkillVersion(root)).toBeUndefined()
    expect(installedSkillVersion(root, YT_SKILL_NAME)).toBeUndefined()
  })

  it('用户自己放了同名 youtube-downloader：不覆盖也不删除，主 skill 照常写入和删除', () => {
    mkdirSync(join(root, 'youtube-downloader'))
    writeFileSync(ytFile(), '---\nname: youtube-downloader\n---\n我的')
    writeSkill(root, '1.0.0')
    expect(readFileSync(ytFile(), 'utf8')).toContain('我的')
    expect(installedSkillVersion(root)).toBe('1.0.0')
    expect(installedSkillVersion(root, YT_SKILL_NAME)).toBeNull()
    expect(removeSkill(root)).toBe(true)
    expect(readFileSync(ytFile(), 'utf8')).toContain('我的')
    expect(installedSkillVersion(root)).toBeUndefined()
  })

  it('只剩我们生成的 youtube-downloader（主 skill 被用户删了）：删掉它，返回主 skill 没删', () => {
    writeSkill(root, '1.0.0')
    rmSync(join(root, 'bili-downloader'), { recursive: true })
    expect(removeSkill(root)).toBe(false)
    expect(installedSkillVersion(root, YT_SKILL_NAME)).toBeUndefined()
  })
})
