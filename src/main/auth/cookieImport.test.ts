import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@shared/types'

const m = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  clearBiliCookies: vi.fn(async () => {}),
  setBiliCookies: vi.fn(async (_list: unknown[]) => {}),
  snapshotCookies: vi.fn()
}))

vi.mock('./authGuard', () => ({ checkAuth: m.checkAuth }))
// isBiliHost 用真实实现
vi.mock('./session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session')>()),
  clearBiliCookies: m.clearBiliCookies,
  setBiliCookies: m.setBiliCookies,
  snapshotCookies: m.snapshotCookies
}))

const { importCookieText, parseCookieText } = await import('./cookieImport')

const NOW = 1_700_000_000
const HALF_YEAR = 180 * 86400

describe('parseCookieText', () => {
  it('parses a semicolon separated header', () => {
    const c = parseCookieText('Cookie: SESSDATA=abc%2C123; bili_jct=xyz; DedeUserID=42', NOW)
    expect(c.map((x) => [x.name, x.value, x.domain, x.httpOnly])).toEqual([
      ['SESSDATA', 'abc%2C123', '.bilibili.com', true],
      ['bili_jct', 'xyz', '.bilibili.com', false],
      ['DedeUserID', '42', '.bilibili.com', false]
    ])
    expect(c[0].expires).toBe(NOW + 180 * 86400)
  })

  it('keeps "=" inside values', () => {
    expect(parseCookieText('a=b=c', NOW)[0].value).toBe('b=c')
  })

  it('parses an extension JSON export and drops other sites', () => {
    const c = parseCookieText(
      JSON.stringify([
        { name: 'SESSDATA', value: 's', domain: '.bilibili.com', httpOnly: true, secure: true, expirationDate: 1800000000.5, sameSite: 'lax' },
        { name: 'other', value: 'x', domain: '.example.com' },
        { name: 'buvid3', value: 'b', domain: 'www.bilibili.com' }
      ]),
      NOW
    )
    expect(c).toHaveLength(2)
    expect(c[0]).toMatchObject({ name: 'SESSDATA', domain: '.bilibili.com', expires: 1800000000, sameSite: 'lax', httpOnly: true })
    expect(c[1]).toMatchObject({ name: 'buvid3', domain: 'www.bilibili.com' })
  })
})

describe('parseCookieText：JSON 格式', () => {
  it('单个对象也能解析，缺的字段补默认值', () => {
    expect(parseCookieText(JSON.stringify({ name: 'SESSDATA', value: 's' }), NOW)).toEqual([
      {
        domain: '.bilibili.com',
        name: 'SESSDATA',
        value: 's',
        path: '/',
        secure: true,
        httpOnly: true,
        expires: NOW + HALF_YEAR,
        sameSite: 'unspecified'
      }
    ])
  })

  it('bilibili.com 不带点时补成域 Cookie，不带点的子域名保持只属于该主机', () => {
    const c = parseCookieText(
      JSON.stringify([
        { name: 'a', value: '1', domain: 'bilibili.com' },
        { name: 'b', value: '2', domain: 'passport.bilibili.com' },
        { name: 'c', value: '3', domain: '.www.bilibili.com' }
      ]),
      NOW
    )
    expect(c.map((x) => x.domain)).toEqual(['.bilibili.com', 'passport.bilibili.com', '.www.bilibili.com'])
  })

  it('丢掉仿冒的 B站域名（evilbilibili.com 之类）', () => {
    const c = parseCookieText(
      JSON.stringify([
        { name: 'SESSDATA', value: 'evil', domain: 'evilbilibili.com' },
        { name: 'SESSDATA', value: 'evil2', domain: '.notbilibili.com' },
        { name: 'SESSDATA', value: 'ok', domain: '.bilibili.com' }
      ]),
      NOW
    )
    expect(c.map((x) => x.value)).toEqual(['ok'])
  })

  it('sameSite 不区分大小写，认不出的记为 unspecified', () => {
    const c = parseCookieText(
      JSON.stringify(
        ['Lax', 'STRICT', 'None', 'no_restriction', 'unspecified', undefined].map((sameSite, i) => ({
          name: `c${i}`,
          value: 'v',
          sameSite
        }))
      ),
      NOW
    )
    expect(c.map((x) => x.sameSite)).toEqual(['lax', 'strict', 'no_restriction', 'no_restriction', 'unspecified', 'unspecified'])
  })

  it('显式给出的 path、secure、httpOnly 照用，过期时间取整', () => {
    const [c] = parseCookieText(
      JSON.stringify([{ name: 'SESSDATA', value: 's', path: '/x', secure: false, httpOnly: false, expirationDate: 1_750_000_000.9 }]),
      NOW
    )
    expect(c).toMatchObject({ path: '/x', secure: false, httpOnly: false, expires: 1_750_000_000 })
  })

  it('没有名字或值不是字符串的条目丢掉', () => {
    const c = parseCookieText(
      JSON.stringify([{ name: '', value: 'x' }, { name: 'a', value: 1 }, { value: 'x' }, { name: 'b', value: '' }]),
      NOW
    )
    expect(c.map((x) => x.name)).toEqual(['b'])
  })
})

describe('parseCookieText：Cookie 头格式', () => {
  it('前缀不区分大小写，前后空白去掉', () => {
    const c = parseCookieText('  cookie:   SESSDATA = s ;bili_jct=j  ', NOW)
    expect(c.map((x) => [x.name, x.value])).toEqual([
      ['SESSDATA', 's'],
      ['bili_jct', 'j']
    ])
    expect(c.every((x) => x.sameSite === 'unspecified' && x.secure && x.path === '/')).toBe(true)
  })

  it('没有名字或没有 = 的片段丢掉', () => {
    expect(parseCookieText('=x; flag; a=1;; b=', NOW).map((x) => [x.name, x.value])).toEqual([
      ['a', '1'],
      ['b', '']
    ])
  })
})

describe('importCookieText', () => {
  const IN: AuthState = { loggedIn: true, user: { mid: 1, uname: 'u', face: '', vipActive: false, vipLabel: '' } }
  const OUT: AuthState = { loggedIn: false, expired: true }
  /** 导入前已经登录着的 cookie */
  const OLD = [{ domain: '.bilibili.com', name: 'SESSDATA', value: 'mine', path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const }]

  beforeEach(() => {
    vi.clearAllMocks()
    m.checkAuth.mockResolvedValue(IN)
    m.snapshotCookies.mockResolvedValue(OLD)
  })

  it('先清掉旧 Cookie 再写入，然后确认登录', async () => {
    expect(await importCookieText('SESSDATA=s; bili_jct=j')).toBe(IN)
    expect(m.clearBiliCookies).toHaveBeenCalledTimes(1)
    expect(m.setBiliCookies).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'SESSDATA', value: 's' }),
      expect.objectContaining({ name: 'bili_jct', value: 'j' })
    ])
    expect(m.clearBiliCookies.mock.invocationCallOrder[0]).toBeLessThan(m.setBiliCookies.mock.invocationCallOrder[0])
  })

  it('看不懂的内容报错', async () => {
    await expect(importCookieText('[not json')).rejects.toThrow('看不懂这段内容')
    expect(m.clearBiliCookies).not.toHaveBeenCalled()
  })

  it('没有 SESSDATA（或值为空）时报错，且不动现有的 Cookie', async () => {
    await expect(importCookieText('bili_jct=j')).rejects.toThrow('里面没有 SESSDATA，无法登录')
    await expect(importCookieText('SESSDATA=; bili_jct=j')).rejects.toThrow('里面没有 SESSDATA')
    expect(m.clearBiliCookies).not.toHaveBeenCalled()
    expect(m.setBiliCookies).not.toHaveBeenCalled()
  })

  it('写入后仍未登录时提示 Cookie 已失效，并恢复原来的登录（回归）', async () => {
    m.checkAuth.mockResolvedValueOnce(OUT).mockResolvedValueOnce(IN)
    await expect(importCookieText('SESSDATA=old')).rejects.toThrow('这段 Cookie 已经失效，请重新获取')
    expect(m.clearBiliCookies).toHaveBeenCalledTimes(2)
    expect(m.setBiliCookies.mock.calls.at(-1)![0]).toBe(OLD)
    expect(m.clearBiliCookies.mock.invocationCallOrder[1]).toBeLessThan(m.setBiliCookies.mock.invocationCallOrder[1])
    // 恢复后重新确认一次，界面回到已登录
    expect(m.checkAuth).toHaveBeenCalledTimes(2)
  })

  it('确认登录时出错也恢复原来的登录，原样抛出错误', async () => {
    const err = new Error('网络请求失败')
    m.checkAuth.mockRejectedValueOnce(err).mockResolvedValueOnce(IN)
    await expect(importCookieText('SESSDATA=s')).rejects.toBe(err)
    expect(m.setBiliCookies.mock.calls.at(-1)![0]).toBe(OLD)
  })

  it('恢复也失败时只记日志，报的还是导入的错误', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    m.checkAuth.mockResolvedValue(OUT)
    m.setBiliCookies.mockResolvedValueOnce().mockRejectedValueOnce(new Error('写不进去'))
    await expect(importCookieText('SESSDATA=s')).rejects.toThrow('这段 Cookie 已经失效')
    expect(warn).toHaveBeenCalledWith('恢复原来的登录失败', expect.objectContaining({ message: '写不进去' }))
    warn.mockRestore()
  })
})
