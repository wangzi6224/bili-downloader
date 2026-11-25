import { describe, expect, it } from 'vitest'
import type { PlainCookie } from '../auth/session'
import { cookieHeader, isYtCookieHost, mergeCookies, parseNetscape, parseYtCookieText, toNetscape, YT_LOGIN_COOKIE, YT_SITE } from './cookies'

const NOW = 1_800_000_000
const HALF_YEAR = 180 * 86400

const ck = (o: Partial<PlainCookie> = {}): PlainCookie => ({
  domain: '.youtube.com',
  name: 'SID',
  value: 'v',
  path: '/',
  secure: true,
  httpOnly: false,
  expires: NOW + 100,
  sameSite: 'unspecified',
  ...o
})

describe('isYtCookieHost', () => {
  it('只认 youtube.com 及其子域名', () => {
    for (const h of ['youtube.com', '.youtube.com', 'www.youtube.com', 'M.YOUTUBE.COM']) expect(isYtCookieHost(h)).toBe(true)
    for (const h of ['google.com', '.google.com', 'fakeyoutube.com', 'youtube.com.evil.com', 'youtube.co']) expect(isYtCookieHost(h)).toBe(false)
  })

  it('登录 cookie 是 SAPISID，导入浏览器时按它判断', () => {
    expect(YT_LOGIN_COOKIE).toBe('SAPISID')
    expect(YT_SITE.key).toBe('SAPISID')
    expect(YT_SITE.host('.youtube.com')).toBe(true)
  })
})

describe('parseNetscape', () => {
  it('解析 httpOnly 前缀，跳过注释、空行、字段不足的行和别的网站', () => {
    const text = [
      '# Netscape HTTP Cookie File',
      '',
      '   ',
      '#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1900000000\tHSID\th',
      '.youtube.com\tTRUE\t\tFALSE\t0\tPREF\ta\tb',
      'www.youtube.com\tFALSE\t/watch\ttrue\t-1\tX\t',
      '.google.com\tTRUE\t/\tTRUE\t1900000000\tSID\tg',
      '.youtube.com\tTRUE\t/\tTRUE\t1900000000\tSHORT'
    ].join('\r\n')
    expect(parseNetscape(text)).toEqual([
      { domain: '.youtube.com', name: 'HSID', value: 'h', path: '/', secure: true, httpOnly: true, expires: 1900000000, sameSite: 'unspecified' },
      // 值里带 tab 时原样保留；路径为空时用 /；过期为 0 是会话 cookie
      { domain: '.youtube.com', name: 'PREF', value: 'a\tb', path: '/', secure: false, httpOnly: false, expires: undefined, sameSite: 'unspecified' },
      { domain: 'www.youtube.com', name: 'X', value: '', path: '/watch', secure: true, httpOnly: false, expires: undefined, sameSite: 'unspecified' }
    ])
  })
})

describe('parseYtCookieText', () => {
  it('cookies.txt：带 tab 且有 youtube.com 时按 Netscape 解析', () => {
    const text = `\n# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1900000000\tSAPISID\tabc\n`
    expect(parseYtCookieText(text, NOW)).toEqual([
      { domain: '.youtube.com', name: 'SAPISID', value: 'abc', path: '/', secure: true, httpOnly: false, expires: 1900000000, sameSite: 'unspecified' }
    ])
  })

  it('JSON 数组：域名规范化、默认值、sameSite 映射，过滤别的网站和不完整的', () => {
    const json = JSON.stringify([
      { name: 'A', value: '1', domain: 'youtube.com', path: '/p', secure: false, httpOnly: true, expirationDate: 1900000000.9, sameSite: 'no_restriction' },
      { name: 'B', value: '2', domain: '.youtube.com', sameSite: 'None' },
      { name: 'C', value: '3', domain: 'www.youtube.com', sameSite: 'Lax' },
      { name: 'D', value: '4', sameSite: 'strict' },
      { name: 'E', value: '5', sameSite: 'unspecified' },
      { name: 'G', value: '6', domain: '.google.com' },
      { name: '', value: '7' },
      { name: 'N', value: 8 }
    ])
    const list = parseYtCookieText(json, NOW)
    expect(list.map((c) => [c.name, c.domain, c.sameSite])).toEqual([
      ['A', '.youtube.com', 'no_restriction'],
      ['B', '.youtube.com', 'no_restriction'],
      ['C', 'www.youtube.com', 'lax'],
      ['D', '.youtube.com', 'strict'],
      ['E', '.youtube.com', 'unspecified']
    ])
    expect(list[0]).toEqual({ domain: '.youtube.com', name: 'A', value: '1', path: '/p', secure: false, httpOnly: true, expires: 1900000000, sameSite: 'no_restriction' })
    // 缺省：路径 /、secure、非 httpOnly、半年后过期
    expect(list[1]).toMatchObject({ path: '/', secure: true, httpOnly: false, expires: NOW + HALF_YEAR })
  })

  it('JSON 单个对象', () => {
    expect(parseYtCookieText('  {"name":"SAPISID","value":"x","domain":".youtube.com"}  ', NOW)).toEqual([
      { domain: '.youtube.com', name: 'SAPISID', value: 'x', path: '/', secure: true, httpOnly: false, expires: NOW + HALF_YEAR, sameSite: 'unspecified' }
    ])
  })

  it('JSON 写错时抛错', () => {
    expect(() => parseYtCookieText('[{bad', NOW)).toThrow()
  })

  it('请求头格式：去掉 Cookie: 前缀，值里可以有 =，丢掉不成对的', () => {
    expect(parseYtCookieText('Cookie: SID=a; HSID=b=c;=x; junk ; ', NOW)).toEqual([
      { domain: '.youtube.com', name: 'SID', value: 'a', path: '/', secure: true, httpOnly: false, expires: NOW + HALF_YEAR, sameSite: 'unspecified' },
      { domain: '.youtube.com', name: 'HSID', value: 'b=c', path: '/', secure: true, httpOnly: false, expires: NOW + HALF_YEAR, sameSite: 'unspecified' }
    ])
    expect(parseYtCookieText('a=1')).toHaveLength(1)
  })

  it('带 tab 但不是 youtube.com 的内容按请求头解析，什么也得不到', () => {
    expect(parseYtCookieText('.google.com\tTRUE\t/\tTRUE\t0\tSID\tx', NOW)).toEqual([])
    expect(parseYtCookieText('', NOW)).toEqual([])
  })

  it('不传 now 时按当前时间算过期', () => {
    const before = Math.floor(Date.now() / 1000)
    const [c] = parseYtCookieText('[{"name":"A","value":"1"}]')
    expect(c.expires).toBeGreaterThanOrEqual(before + HALF_YEAR)
  })
})

describe('toNetscape', () => {
  it('写出 cookies.txt，能再解析回来', () => {
    const list = [
      ck({ name: 'HSID', value: 'h', httpOnly: true, expires: 1900000000 }),
      ck({ domain: 'www.youtube.com', name: 'X', path: '', secure: false, expires: undefined })
    ]
    const text = toNetscape(list)
    expect(text).toBe(
      [
        '# Netscape HTTP Cookie File',
        '#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1900000000\tHSID\th',
        'www.youtube.com\tFALSE\t/\tFALSE\t0\tX\tv',
        ''
      ].join('\n')
    )
    expect(parseNetscape(text)).toEqual([list[0], { ...list[1], path: '/' }])
  })

  it('没有 cookie 时只有文件头', () => {
    expect(toNetscape([])).toBe('# Netscape HTTP Cookie File\n')
  })
})

describe('mergeCookies', () => {
  it('同域名（不论有没有点）、路径、名字的用新值，保留原来的 sameSite；新的加进去', () => {
    const old = [ck({ name: 'SID', value: 'old', sameSite: 'lax' }), ck({ name: 'PREF', path: '' })]
    const fresh = [ck({ domain: 'youtube.com', name: 'SID', value: 'new', sameSite: 'unspecified' }), ck({ name: 'NEW', value: 'n', sameSite: 'strict' }), ck({ name: 'PREF', path: '/', value: 'p2' })]
    const merged = mergeCookies(old, fresh, NOW)
    expect(merged.map((c) => [c.name, c.value, c.sameSite])).toEqual([
      ['SID', 'new', 'lax'],
      ['PREF', 'p2', 'unspecified'],
      ['NEW', 'n', 'strict']
    ])
    expect(merged[0].domain).toBe('youtube.com')
  })

  it('过期的去掉（包括新写回的已过期 cookie），会话 cookie 保留', () => {
    const old = [ck({ name: 'GONE', expires: NOW - 1 }), ck({ name: 'SESSION', expires: undefined }), ck({ name: 'DEL' })]
    const fresh = [ck({ name: 'DEL', expires: NOW })]
    expect(mergeCookies(old, fresh, NOW).map((c) => c.name)).toEqual(['SESSION'])
  })

  it('不传 now 时按当前时间', () => {
    expect(mergeCookies([ck({ expires: 1 })], [])).toEqual([])
  })
})

describe('cookieHeader', () => {
  it('拼成 Cookie 请求头', () => {
    expect(cookieHeader([ck({ name: 'a', value: '1' }), ck({ name: 'b', value: '2' })])).toBe('a=1; b=2')
    expect(cookieHeader([])).toBe('')
  })
})
