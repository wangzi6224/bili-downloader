import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const h = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => h.userData, getName: () => 'B站下载器', getVersion: () => '1.2.3' } }))
const { initLogger, logDir } = await import('./logger')

const LEVELS = ['log', 'info', 'warn', 'error'] as const
const EVENTS = ['uncaughtException', 'unhandledRejection'] as const
type Hook = (err: unknown) => void
const hooks = (e: (typeof EVENTS)[number]): Hook[] => process.listeners(e as 'uncaughtException') as Hook[]
let originals: Record<string, (...args: unknown[]) => void> = {}
let listeners: Record<string, Hook[]> = {}
/** initLogger 包装前的 console 方法，换成静默的 mock，免得测试输出里一堆日志 */
let inner: Record<(typeof LEVELS)[number], Mock> = {} as never

const logFile = (): string => join(h.userData, 'logs', 'main.log')
const lines = (): string[] => readFileSync(logFile(), 'utf8').trim().split('\n')

beforeEach(() => {
  h.userData = mkdtempSync(join(tmpdir(), 'logger-'))
  originals = Object.fromEntries(LEVELS.map((l) => [l, console[l]]))
  listeners = Object.fromEntries(EVENTS.map((e) => [e, hooks(e)]))
  for (const l of LEVELS) console[l] = inner[l] = vi.fn()
})
afterEach(() => {
  Object.assign(console, originals)
  // 只摘掉 initLogger 加的，vitest 自己也挂了监听
  for (const e of EVENTS) for (const fn of hooks(e)) if (!listeners[e].includes(fn)) process.off(e as 'uncaughtException', fn)
  rmSync(h.userData, { recursive: true, force: true })
})

const added = (e: (typeof EVENTS)[number]): Hook => hooks(e).find((fn) => !listeners[e].includes(fn))!

describe('initLogger', () => {
  it('日志放在数据目录下', () => {
    expect(logDir()).toBe(join(h.userData, 'logs'))
  })

  it('启动时记一行版本信息，之后 console 输出同时写进 main.log', () => {
    initLogger()
    console.warn('下载 %d 个', 3)
    expect(inner.warn).toHaveBeenCalledWith('下载 %d 个', 3)
    const [start, warn] = lines()
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[info\] 启动 B站下载器 1\.2\.3（/)
    expect(warn).toMatch(/ \[warn\] 下载 3 个$/)
    console.log('a')
    console.error('b')
    expect(lines().slice(2).map((l) => l.replace(/^\S+ /, ''))).toEqual(['[log] a', '[error] b'])
  })

  it('未捕获的异常也写进日志', () => {
    initLogger()
    added('uncaughtException')(new Error('炸了'))
    added('unhandledRejection')('没人接')
    const text = readFileSync(logFile(), 'utf8')
    expect(text).toContain('[error] uncaughtException Error: 炸了')
    expect(text).toContain('[error] unhandledRejection 没人接')
  })

  it('超过 5MB 时把旧日志改名为 main.old.log', () => {
    mkdirSync(join(h.userData, 'logs'))
    const big = 5 * 1024 * 1024 + 1
    writeFileSync(logFile(), Buffer.alloc(big))
    initLogger()
    expect(statSync(join(h.userData, 'logs', 'main.old.log')).size).toBe(big)
    expect(lines()).toHaveLength(1)
  })

  it('日志写不进去也不影响 console 本身', () => {
    // main.log 是个目录，追加会失败
    mkdirSync(logFile(), { recursive: true })
    initLogger()
    expect(() => console.error('照常输出')).not.toThrow()
    expect(inner.error).toHaveBeenCalledWith('照常输出')
  })
})
