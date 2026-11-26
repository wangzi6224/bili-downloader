import { describe, expect, it, vi } from 'vitest'
import { DY_LOGIN_COOKIE, DY_SITE, isDyCookieHost, parseDyCookieText } from './cookies'

const NOW = 1_800_000_000
const HALF_YEAR = 180 * 86400

const plain = (name: string, value: string) => ({
  domain: '.douyin.com',
  name,
  value,
  path: '/',
  secure: true,
  httpOnly: false,
  expires: NOW + HALF_YEAR,
  sameSite: 'unspecified'
})

describe('isDyCookieHost', () => {
  it('只认 douyin.com 及其子域名', () => {
    for (const h of ['douyin.com', '.douyin.com', 'www.douyin.com', 'LIVE.DOUYIN.COM']) expect(isDyCookieHost(h)).toBe(true)
    for (const h of ['iesdouyin.com', 'fakedouyin.com', 'douyin.com.evil.example', 'douyin.co', 'bytedance.com']) expect(isDyCookieHost(h)).toBe(false)
  })

  it('登录 cookie 是 sessionid', () => {
    expect(DY_LOGIN_COOKIE).toBe('sessionid')
    expect(DY_SITE).toEqual({ host: isDyCookieHost, key: 'sessionid' })
  })
})

describe('cookies.txt', () => {
  it('解析 httpOnly 前缀，跳过注释、空行、字段不足的行和别的网站', () => {
    const text = [
      '# Netscape HTTP Cookie File',
      '',
      '#HttpOnly_.douyin.com\tTRUE\t/\tTRUE\t1900000000\tsessionid\tfake',
      '.douyin.com\tTRUE\t\tFALSE\t0\tpref\ta\tb',
      'www.douyin.com\tFALSE\t/video\ttrue\t-1\tx\t',
      '.example.com\tTRUE\t/\tTRUE\t1900000000\tsessionid\tother',
      '.douyin.com\tTRUE\t/\tTRUE\t1900000000\tshort'
    ].join('\r\n')
    expect(parseDyCookieText(`\n${text}\n`)).toEqual([
      { domain: '.douyin.com', name: 'sessionid', value: 'fake', path: '/', secure: true, httpOnly: true, expires: 1900000000, sameSite: 'unspecified' },
      { domain: '.douyin.com', name: 'pref', value: 'a\tb', path: '/', secure: false, httpOnly: false, expires: undefined, sameSite: 'unspecified' },
      { domain: 'www.douyin.com', name: 'x', value: '', path: '/video', secure: true, httpOnly: false, expires: undefined, sameSite: 'unspecified' }
    ])
  })
})

describe('扩展导出的 JSON', () => {
  it('补齐缺省字段，换算过期时间和 SameSite', () => {
    const text = JSON.stringify([
      { name: 'sessionid', value: 'fake' },
      {
        name: 'a',
        value: '1',
        domain: 'douyin.com',
        path: '/p',
        secure: false,
        httpOnly: true,
        expirationDate: 1900000000.7,
        sameSite: 'No_Restriction'
      },
      { name: 'b', value: '2', domain: 'www.douyin.com', sameSite: 'none' },
      { name: 'c', value: '3', domain: '.douyin.com', sameSite: 'Lax' },
      { name: 'd', value: '4', sameSite: 'strict' },
      { name: 'e', value: '5', sameSite: 'weird' },
      { name: 'other', value: 'x', domain: '.example.com' },
      { value: '没有名字' },
      { name: 'number', value: 1 }
    ])
    const list = parseDyCookieText(text, NOW)
    expect(list[0]).toEqual(plain('sessionid', 'fake'))
    expect(list[1]).toEqual({
      domain: '.douyin.com',
      name: 'a',
      value: '1',
      path: '/p',
      secure: false,
      httpOnly: true,
      expires: 1900000000,
      sameSite: 'no_restriction'
    })
    expect(list.map((c) => [c.name, c.domain, c.sameSite])).toEqual([
      ['sessionid', '.douyin.com', 'unspecified'],
      ['a', '.douyin.com', 'no_restriction'],
      ['b', 'www.douyin.com', 'no_restriction'],
      ['c', '.douyin.com', 'lax'],
      ['d', '.douyin.com', 'strict'],
      ['e', '.douyin.com', 'unspecified']
    ])
  })

  it('单个对象也认', () => {
    expect(parseDyCookieText('{"name":"sessionid","value":"fake"}', NOW)).toEqual([plain('sessionid', 'fake')])
  })

  it('不是合法 JSON 时抛错', () => {
    expect(() => parseDyCookieText('[oops', NOW)).toThrow(SyntaxError)
  })

  it('用 tab 缩进的 JSON 也按 JSON 解析', () => {
    const text = JSON.stringify([{ name: 'sessionid', value: 'fake', domain: '.douyin.com' }], null, '\t')
    expect(parseDyCookieText(text, NOW)).toEqual([plain('sessionid', 'fake')])
  })
})

describe('请求头那一行', () => {
  it('去掉开头的 Cookie:，按分号切开，丢掉没有名字或等号的部分', () => {
    expect(parseDyCookieText('Cookie: sessionid=fake; a= x=y ;bad; =novalue;  =; b=', NOW)).toEqual([
      plain('sessionid', 'fake'),
      plain('a', 'x=y'),
      plain('b', '')
    ])
  })

  it('空内容得到空列表', () => {
    expect(parseDyCookieText('   ', NOW)).toEqual([])
  })

  it('缺省按当前时间算过期', () => {
    vi.useFakeTimers({ now: NOW * 1000 + 500 })
    expect(parseDyCookieText('a=1')[0].expires).toBe(NOW + HALF_YEAR)
    vi.useRealTimers()
  })
})
