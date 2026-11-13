import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'jsonc-parser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigParseError, readEntry, removeEntry, sameEntry, writeEntry, type ConfigTarget, type StdioEntry } from './configFile'

let dir: string
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'agent-cfg-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const entry: StdioEntry = { command: '/Apps/B站下载器', args: ['/x/bridge.js', '--user-data', '/d'], env: { ELECTRON_RUN_AS_NODE: '1' } }
const json = (file = 'mcp.json', extra?: Record<string, unknown>): ConfigTarget => ({ file: join(dir, 'sub', file), format: 'json', key: ['mcpServers'], extra })
const toml = (): ConfigTarget => ({ file: join(dir, 'config.toml'), format: 'toml', key: ['mcp_servers'] })
const text = (t: ConfigTarget): string => readFileSync(t.file, 'utf8')

describe('JSON 配置', () => {
  it('文件不存在时新建，读回来的条目和写入的一致', () => {
    const t = json('mcp.json', { type: 'stdio' })
    expect(readEntry(t)).toBeUndefined()
    expect(removeEntry(t)).toBe(false)
    writeEntry(t, entry)
    expect(JSON.parse(text(t))).toEqual({ mcpServers: { 'bili-downloader': { type: 'stdio', ...entry } } })
    expect(sameEntry(readEntry(t), entry)).toBe(true)
    // 新建的文件不留备份
    expect(existsSync(`${t.file}.bili-backup`)).toBe(false)
  })

  it('保留原有的注释、其他服务和缩进，第一次改之前备份；再写一样的内容不动文件', () => {
    const t = json()
    writeEntry(t, entry)
    const original = '{\n    // 我的服务\n    "mcpServers": {\n        "other": { "command": "x" }\n    },\n    "theme": "dark"\n}\n'
    writeFileSync(t.file, original)
    writeEntry(t, entry)
    const out = text(t)
    expect(out).toContain('// 我的服务')
    // jsonc-parser 会重排所在对象的格式，内容不变
    expect(parse(out).mcpServers.other).toEqual({ command: 'x' })
    expect(parse(out).theme).toBe('dark')
    expect(out).toContain('        "bili-downloader": {')
    expect(readFileSync(`${t.file}.bili-backup`, 'utf8')).toBe(original)
    writeEntry(t, entry)
    expect(text(t)).toBe(out)
  })

  it('用 tab 缩进的文件继续用 tab；空文件当作空对象', () => {
    const t = json()
    writeEntry(t, entry)
    writeFileSync(t.file, '{\n\t"a": 1\n}')
    writeEntry(t, entry)
    expect(text(t)).toContain('\n\t"mcpServers"')
    writeFileSync(t.file, '  ')
    writeEntry(t, entry)
    expect(JSON.parse(text(t)).mcpServers['bili-downloader'].command).toBe(entry.command)
  })

  it('嵌套的键路径（VS Code 风格）也能写', () => {
    const t: ConfigTarget = { file: join(dir, 'settings.json'), format: 'json', key: ['mcp', 'servers'] }
    writeEntry(t, entry)
    expect(JSON.parse(text(t)).mcp.servers['bili-downloader'].args).toEqual(entry.args)
  })

  it('卸载只删我们这一项', () => {
    const t = json()
    writeEntry(t, entry)
    const data = JSON.parse(text(t))
    data.mcpServers.other = { command: 'x' }
    writeFileSync(t.file, JSON.stringify(data))
    expect(removeEntry(t)).toBe(true)
    expect(JSON.parse(text(t))).toEqual({ mcpServers: { other: { command: 'x' } } })
    expect(removeEntry(t)).toBe(false)
  })

  it('解析不了、不是对象的文件拒绝改动', () => {
    const t = json()
    writeEntry(t, entry)
    for (const bad of ['{ "a": ', '[1, 2]', 'null']) {
      writeFileSync(t.file, bad)
      expect(() => writeEntry(t, entry)).toThrow(ConfigParseError)
      expect(() => readEntry(t)).toThrow(ConfigParseError)
      expect(() => removeEntry(t)).toThrow(ConfigParseError)
      expect(text(t)).toBe(bad)
    }
  })

  it('条目不是对象时当作没有', () => {
    const t = json()
    writeEntry(t, entry)
    writeFileSync(t.file, '{"mcpServers": {"bili-downloader": "x"}}')
    expect(readEntry(t)).toBeUndefined()
    writeFileSync(t.file, '{"mcpServers": 3}')
    expect(readEntry(t)).toBeUndefined()
  })
})

describe('TOML 配置（Codex）', () => {
  const original = [
    'model = "gpt-5"',
    '',
    '[mcp_servers.other]',
    'command = "x"',
    '',
    '[profiles.fast]',
    'model = "mini"',
    ''
  ].join('\n')

  it('新建文件时只写我们的表', () => {
    const t = toml()
    writeEntry(t, entry)
    expect(text(t)).toBe(
      '[mcp_servers.bili-downloader]\ncommand = "/Apps/B站下载器"\nargs = ["/x/bridge.js", "--user-data", "/d"]\n\n[mcp_servers.bili-downloader.env]\nELECTRON_RUN_AS_NODE = "1"\n'
    )
    expect(readEntry(t)).toEqual({ command: entry.command, args: entry.args })
  })

  it('追加到文件末尾，其他内容一字不动；更新时原地替换', () => {
    const t = toml()
    writeFileSync(t.file, original)
    writeEntry(t, entry)
    const first = text(t)
    expect(first.startsWith(original.trimEnd() + '\n\n[mcp_servers.bili-downloader]')).toBe(true)
    // 把我们的表挪到中间，再更新：留在原处，后面的表不受影响
    const moved = first.slice(first.indexOf('[mcp_servers.bili-downloader]')) + '\n' + original
    writeFileSync(t.file, moved)
    writeEntry(t, { ...entry, command: '/new' })
    const out = text(t)
    expect(out.startsWith('[mcp_servers.bili-downloader]\ncommand = "/new"')).toBe(true)
    expect(out).toContain('[profiles.fast]\nmodel = "mini"')
    expect(out.match(/bili-downloader\]/g)).toHaveLength(1)
    expect(sameEntry(readEntry(t), entry)).toBe(false)
  })

  it('带引号的表名、额外字段也认得；卸载后恢复原样', () => {
    const t: ConfigTarget = { ...toml(), extra: { startup_timeout_sec: 30 } }
    writeFileSync(t.file, original)
    writeEntry(t, entry)
    expect(text(t)).toContain('startup_timeout_sec = 30')
    writeFileSync(t.file, text(t).replace('[mcp_servers.bili-downloader]', '[mcp_servers."bili-downloader"]  # 注释'))
    expect(readEntry(t)?.command).toBe(entry.command)
    expect(removeEntry(t)).toBe(true)
    expect(text(t)).toBe(original.trimEnd() + '\n')
    expect(removeEntry(t)).toBe(false)
    expect(readEntry(t)).toBeUndefined()
  })

  it('下一张表上面的注释和多行字符串里的空行都原样保留', () => {
    const t = toml()
    const prompt = 'developer_instructions = """\n第一段\n\n\n\n第二段\n"""'
    writeFileSync(t.file, `${prompt}\n\n[mcp_servers.bili-downloader]\ncommand = "/old"\n\n# 公司代理\n[mcp_servers.proxy]\ncommand = "p"\n`)
    writeEntry(t, entry)
    const updated = text(t)
    expect(updated).toContain('# 公司代理\n[mcp_servers.proxy]')
    expect(updated.startsWith(prompt)).toBe(true)
    expect(readEntry(t)?.command).toBe(entry.command)
    expect(removeEntry(t)).toBe(true)
    expect(text(t)).toBe(`${prompt}\n\n# 公司代理\n[mcp_servers.proxy]\ncommand = "p"\n`)
  })

  it('用户用内联表或点号键定义了同名服务时拒绝改动，免得同一个键定义两次', () => {
    const t = toml()
    for (const bad of [
      '[mcp_servers]\nbili-downloader = { command = "x" }\n',
      '[mcp_servers]\n"bili-downloader".command = "x"\n',
      'mcp_servers.bili-downloader.command = "x"\n',
      'mcp_servers = { bili-downloader = { command = "x" } }\n'
    ]) {
      writeFileSync(t.file, bad)
      expect(() => writeEntry(t, entry), bad).toThrow(ConfigParseError)
      expect(() => readEntry(t), bad).toThrow(ConfigParseError)
      expect(() => removeEntry(t), bad).toThrow(ConfigParseError)
      expect(text(t)).toBe(bad)
    }
    // 其他服务的内联写法不受影响
    writeFileSync(t.file, '[mcp_servers]\nother = { command = "x" }\n')
    writeEntry(t, entry)
    expect(readEntry(t)?.command).toBe(entry.command)
  })

  it('用户手改成单引号时读不出值，当作需要重写', () => {
    const t = toml()
    writeFileSync(t.file, "[mcp_servers.bili-downloader]\ncommand = '/x'\n")
    expect(sameEntry(readEntry(t), entry)).toBe(false)
  })
})

describe('sameEntry', () => {
  it('只比较 command 和 args', () => {
    expect(sameEntry(undefined, entry)).toBe(false)
    expect(sameEntry({ command: entry.command, args: entry.args }, entry)).toBe(true)
    expect(sameEntry({ command: entry.command, args: [] }, entry)).toBe(false)
  })
})
