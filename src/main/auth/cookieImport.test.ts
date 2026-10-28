import { describe, expect, it } from 'vitest'
import { parseCookieText } from './cookieImport'

const NOW = 1_700_000_000

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
