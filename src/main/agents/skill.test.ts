import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLanguage } from '@shared/i18n'
import { installedSkillVersion, removeSkill, SKILL_DESCRIPTION, skillMarkdown, writeSkill } from './skill'

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
    for (const word of ['B站下载', 'B站下载器', '下载B站视频', 'B站视频下载', 'B站搜索', '搜B站视频', 'UP主', 'BV号', 'b23.tv', 'bilibili', 'Bilibili video download', 'Bilibili search']) {
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
