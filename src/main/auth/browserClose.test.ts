import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  execFile: vi.fn(),
  showDialog: vi.fn()
}))

vi.mock('node:child_process', () => ({ execFile: m.execFile }))
vi.mock('../windows', () => ({ showDialog: m.showDialog }))

const { canCloseBrowser, closeBrowser, confirmCloseBrowser } = await import('./browserClose')

type Cb = (err: Error | null, stdout: string, stderr: string) => void

const decode = (args: string[]): string => Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
const isTaskkill = (file: string): boolean => file.endsWith('taskkill.exe')
const taskkills = (): string[][] => m.execFile.mock.calls.filter(([f]) => isTaskkill(f as string)).map(([, a]) => a as string[])

/** 每次查进程依次返回这些 PID */
function pids(...rounds: string[]): void {
  m.execFile.mockImplementation((file: string, _args: string[], _opts: unknown, cb: Cb) => {
    if (isTaskkill(file)) return cb(new Error('exit 128'), '', '')
    cb(null, rounds.shift() ?? '', '')
  })
}

const alive = (): boolean => true

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('canCloseBrowser', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const on = (os: string): void => void Object.defineProperty(process, 'platform', { ...platform, value: os })

  afterEach(() => void Object.defineProperty(process, 'platform', platform))

  it.each(['darwin', 'linux'])('%s 上没有 PowerShell 和 taskkill，不能代为关闭', (os) => {
    on(os)
    expect(canCloseBrowser('chrome')).toBe(false)
  })

  it('只认识的浏览器才能关', () => {
    on('win32')
    for (const key of ['chrome', 'edge', 'brave', 'vivaldi', 'chromium', 'opera', 'firefox']) expect(canCloseBrowser(key)).toBe(true)
    expect(canCloseBrowser('arc')).toBe(false)
    expect(canCloseBrowser('toString')).toBe(false)
  })
})

describe('confirmCloseBrowser', () => {
  const signal = new AbortController().signal

  it.each([
    [0, 'close'],
    [1, 'qr'],
    [2, 'cancel']
  ])('第 %i 个按钮表示 %s', async (response, choice) => {
    m.showDialog.mockResolvedValue({ response })
    expect(await confirmCloseBrowser('Edge', false, signal)).toBe(choice)
  })

  it('默认按钮是取消，说明可能丢内容；对话框跟着 signal 关闭', async () => {
    m.showDialog.mockResolvedValue({ response: 2 })
    await confirmCloseBrowser('Edge', false, signal)
    const opts = m.showDialog.mock.calls[0][0]
    expect(opts).toMatchObject({ buttons: ['关闭 Edge 并导入', '改用扫码', '取消'], defaultId: 2, cancelId: 2, noLink: true, signal })
    expect(opts.detail).toContain('没有保存的内容可能丢失')
    expect(opts.detail).toContain('不确定 Edge 里有没有 B站登录信息')
  })

  it('启用了应用绑定加密时说明关了也可能读不出', async () => {
    m.showDialog.mockResolvedValue({ response: 2 })
    await confirmCloseBrowser('Chrome', true, signal)
    expect(m.showDialog.mock.calls[0][0].detail).toContain('关闭后也可能读不出登录信息')
  })
})

describe('closeBrowser', () => {
  it('按安装路径找进程，不会把 Chromium、Canary 当成 Chrome', async () => {
    pids('101\r\n102\r\n')
    await closeBrowser('chrome', () => false, alive)
    const [file, args, opts] = m.execFile.mock.calls[0]
    expect(file).toContain('powershell.exe')
    expect(opts).toMatchObject({ windowsHide: true })
    expect(decode(args as string[])).toContain("Name='chrome.exe'")
    expect(decode(args as string[])).toContain('\\Google\\Chrome\\Application\\chrome.exe')
  })

  it('Opera GX 不算 Opera', async () => {
    pids('')
    await closeBrowser('opera', () => false, alive)
    expect(decode(m.execFile.mock.calls[0][1] as string[])).toContain("-like '*\\Opera\\*opera.exe'")
  })

  it('优雅关闭后文件释放了就成功，不强制结束', async () => {
    pids('101\n102\n')
    let locked = true
    const p = closeBrowser('edge', () => locked, alive)
    await vi.advanceTimersByTimeAsync(1000)
    locked = false
    await vi.advanceTimersByTimeAsync(500)
    expect(await p).toBe(true)
    expect(taskkills()).toEqual([['/PID', '101', '/PID', '102']])
  })

  it('等不到就强制结束还在的进程', async () => {
    pids('101\n', '205\n')
    let locked = true
    const p = closeBrowser('edge', () => locked, alive)
    await vi.advanceTimersByTimeAsync(10_000)
    locked = false
    await vi.advanceTimersByTimeAsync(500)
    expect(await p).toBe(true)
    expect(taskkills()).toEqual([
      ['/PID', '101'],
      ['/F', '/T', '/PID', '205']
    ])
  })

  it('强制结束后还是被占用就返回失败', async () => {
    pids('101\n', '101\n')
    const p = closeBrowser('edge', () => true, alive)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await p).toBe(false)
  })

  it('查不到进程时不调用 taskkill，只看文件是否释放', async () => {
    pids('', '')
    const p = closeBrowser('vivaldi', () => true, alive)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await p).toBe(false)
    expect(taskkills()).toEqual([])
  })

  it('查进程失败（输出不是 PID）时当作没查到', async () => {
    m.execFile.mockImplementation((_f: string, _a: string[], _o: unknown, cb: (e: Error, s: undefined, r: string) => void) =>
      cb(new Error('timeout'), undefined, '')
    )
    expect(await closeBrowser('edge', () => false, alive)).toBe(true)
    expect(taskkills()).toEqual([])
  })

  it('查进程期间流程被取消，就不再动手', async () => {
    pids('101\n')
    expect(await closeBrowser('edge', () => true, () => false)).toBe(false)
    expect(taskkills()).toEqual([])
  })

  it('等待期间流程被取消，不强制结束', async () => {
    pids('101\n', '101\n')
    let on = true
    const p = closeBrowser('edge', () => true, () => on)
    await vi.advanceTimersByTimeAsync(1000)
    on = false
    await vi.advanceTimersByTimeAsync(500)
    expect(await p).toBe(false)
    expect(taskkills()).toEqual([['/PID', '101']])
  })

  it('第二次查进程时流程被取消，也不强制结束', async () => {
    let on = true
    m.execFile.mockImplementation((file: string, _a: string[], _o: unknown, cb: Cb) => {
      if (isTaskkill(file)) return cb(null, '', '')
      const first = m.execFile.mock.calls.length === 1
      if (!first) on = false
      cb(null, '101\n', '')
    })
    const p = closeBrowser('edge', () => true, () => on)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await p).toBe(false)
    expect(taskkills()).toEqual([['/PID', '101']])
  })
})
