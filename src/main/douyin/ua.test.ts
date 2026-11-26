import { describe, expect, it } from 'vitest'
import { dyHeaders, dyUserAgent } from './ua'

describe('dyUserAgent', () => {
  it.each([
    ['darwin', 'Macintosh; Intel Mac OS X 10_15_7'],
    ['win32', 'Windows NT 10.0; Win64; x64'],
    ['linux', 'X11; Linux x86_64']
  ] as const)('%s 用对应的系统标识，只保留 Chromium 大版本', (platform, os) => {
    const ua = dyUserAgent(platform, '142.0.7444.59')
    expect(ua).toBe(`Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36`)
    expect(ua).not.toContain('Electron')
  })

  it('拿不到 Chromium 版本时用固定版本', () => {
    expect(dyUserAgent('linux', '')).toContain('Chrome/140.0.0.0')
  })

  it('缺省取当前系统和运行环境', () => {
    expect(dyUserAgent()).toBe(dyUserAgent(process.platform, process.versions.chrome))
  })
})

describe('dyHeaders', () => {
  it('带上抖音的 Referer，UA 可以换', () => {
    expect(dyHeaders()).toEqual({ 'User-Agent': dyUserAgent(), Referer: 'https://www.douyin.com/' })
    expect(dyHeaders('fake-ua')['User-Agent']).toBe('fake-ua')
  })
})
