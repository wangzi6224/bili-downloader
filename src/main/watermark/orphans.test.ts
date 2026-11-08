import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ execFileSync: vi.fn() }))
vi.mock('node:child_process', async (o) => {
  const cp = await o<typeof import('node:child_process')>()
  h.execFileSync.mockImplementation(cp.execFileSync as never)
  return { ...cp, execFileSync: h.execFileSync }
})

const load = async (): Promise<typeof import('./orphans')> => {
  vi.resetModules()
  return import('./orphans')
}

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orphans-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

/** 一个命令行里带着 marker、会一直运行的子进程，模拟没退出的 ffmpeg */
function fakeFfmpeg(marker: string): Promise<ReturnType<typeof spawn>> {
  const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', marker], { stdio: 'ignore' })
  return new Promise((r) => p.once('spawn', () => r(p)))
}

describe('commandLine', () => {
  it('读出活着的进程的命令行；进程不存在时返回 undefined', async () => {
    const { commandLine } = await load()
    const p = await fakeFfmpeg('marker-abc')
    try {
      expect(commandLine(p.pid!)).toContain('marker-abc')
    } finally {
      p.kill('SIGKILL')
    }
    expect(commandLine(2 ** 30)).toBeUndefined()
  }, 20_000)

  it('Windows 上用 PowerShell 按 UTF-8 读；读不到或输出为空时返回 undefined', async () => {
    const { commandLine } = await load()
    h.execFileSync.mockReturnValueOnce('C:\\ffmpeg.exe -i a 视频.mp4.wm.tmp\r\n')
    expect(commandLine(process.pid, 'win32')).toBe('C:\\ffmpeg.exe -i a 视频.mp4.wm.tmp')
    const [bin, args] = h.execFileSync.mock.lastCall!
    expect(bin).toBe('powershell.exe')
    expect(args.at(-1)).toContain('[Console]::OutputEncoding=[Text.Encoding]::UTF8')
    expect(args.at(-1)).toContain(`ProcessId=${process.pid}`)

    h.execFileSync.mockReturnValueOnce('  \n')
    expect(commandLine(process.pid, 'win32')).toBeUndefined()
    h.execFileSync.mockImplementationOnce(() => {
      throw new Error('powershell 不可用')
    })
    expect(commandLine(process.pid, 'darwin')).toBeUndefined()
  })

  it('Linux 上读 /proc/<pid>/cmdline，不依赖 ps', async () => {
    const { commandLine } = await load()
    h.execFileSync.mockClear()
    const p = await fakeFfmpeg('marker-proc')
    try {
      const got = commandLine(p.pid!, 'linux')
      // 别的系统上没有 /proc：读不到时返回 undefined
      if (process.platform === 'linux') expect(got).toContain('marker-proc')
      else expect(got).toBeUndefined()
    } finally {
      p.kill('SIGKILL')
    }
    expect(h.execFileSync).not.toHaveBeenCalled()
  }, 20_000)
})

describe('killLeftovers', () => {
  it('只结束命令行里带着记录的输出文件的进程', async () => {
    const { killLeftovers } = await load()
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const cmd = (pid: number): string | undefined =>
      ({ 11: 'ffmpeg -i x -f mp4 /tmp/a/video.wm.part', 12: '/usr/bin/vim notes.txt' })[pid]
    const n = killLeftovers(
      [
        { pid: 11, output: '/tmp/a/video.wm.part' },
        // 进程号被别的程序复用了
        { pid: 12, output: '/tmp/b/video.wm.part' },
        // 已经退出
        { pid: 13, output: '/tmp/c/video.wm.part' },
        // 坏记录
        { pid: -1, output: '/x' },
        { pid: 14, output: '' },
        null as never
      ],
      cmd
    )
    expect(n).toBe(1)
    expect(kill.mock.calls).toEqual([[11, 'SIGKILL']])
  })

  it('结束时进程刚好自己退出了，不算数也不报错', async () => {
    const { killLeftovers } = await load()
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('no such process'), { code: 'ESRCH' })
    })
    expect(killLeftovers([{ pid: 11, output: 'o' }], () => 'ffmpeg o')).toBe(0)
  })

  it('真的结束没退出的进程', async () => {
    const { killLeftovers } = await load()
    const marker = join(dir, 'video.wm.part')
    const p = await fakeFfmpeg(marker)
    const exited = new Promise((r) => p.once('exit', r))
    expect(killLeftovers([{ pid: p.pid!, output: marker }])).toBe(1)
    await exited
  }, 20_000)
})

describe('登记转码进程', () => {
  it('启动时结束上次留下的进程并清空记录；之后转码时登记、结束时注销', async () => {
    const { initOrphans, trackJob } = await load()
    const file = join(dir, 'ffmpeg-jobs.json')
    const marker = join(dir, 'old.wm.tmp')
    const p = await fakeFfmpeg(marker)
    const exited = new Promise((r) => p.once('exit', r))
    writeFileSync(file, JSON.stringify([{ pid: p.pid, output: marker }]))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    initOrphans(file)
    await exited
    expect(warn).toHaveBeenCalledWith('结束了上次没退出的 1 个转码进程')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([])

    const untrack = trackJob(321, '/tmp/x/video.wm.part')
    trackJob(322, '/tmp/y.mp4.wm.tmp')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([
      { pid: 321, output: '/tmp/x/video.wm.part' },
      { pid: 322, output: '/tmp/y.mp4.wm.tmp' }
    ])
    untrack()
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([{ pid: 322, output: '/tmp/y.mp4.wm.tmp' }])
  }, 20_000)

  it('没有进程号时不登记；还没初始化或写不进文件时不影响转码', async () => {
    const { initOrphans, trackJob } = await load()
    trackJob(1, 'a')()
    trackJob(undefined, 'a')()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 记录文件的位置是个目录，写不进去
    initOrphans(dir)
    expect(() => trackJob(5, 'b')()).not.toThrow()
    expect(warn).toHaveBeenCalledWith('记录转码进程失败：', expect.any(String))
  })
})
