import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { DyError, DyUnavailableError } from './errors'
import { DouyinShare, MOBILE_UA } from './share'

const ID = '7000000000000000001'
const SHORT = 'https://v.douyin.com/FakeCode/'

const redirect = (location: string): Response => new Response('moved', { status: 302, headers: { location } })
const registered = (...cookies: string[]): Response => new Response(null, { headers: cookies.map((c): [string, string] => ['set-cookie', c]) })
const TTWID = (): Response => registered('other=1; Path=/', 'ttwid=fake-token; Path=/; HttpOnly')
const page = (loaderData: unknown): Response =>
  new Response(`<html><script>window._ROUTER_DATA = ${JSON.stringify({ loaderData })}</script></html>`)
const videoPage = (videoInfoRes: unknown): Response => page({ layout: null, other: {}, 'video_(id)/page': { videoInfoRes } })

function setup(...replies: (Response | (() => Response))[]) {
  const queue = [...replies]
  const fetchFn = vi.fn(async (_url: unknown, _init?: RequestInit) => {
    const next = queue.shift()
    if (!next) throw new Error('没有更多的假响应')
    return typeof next === 'function' ? next() : next
  })
  return { share: new DouyinShare(fetchFn as unknown as typeof fetch), fetchFn }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('expand', () => {
  it('跟着跳转直到认出作品地址，用手机 UA 且不自动跳转', async () => {
    const { share, fetchFn } = setup(redirect(`https://www.iesdouyin.com/share/video/${ID}/`))
    await expect(share.expand(SHORT)).resolves.toBe(`https://www.iesdouyin.com/share/video/${ID}/`)
    expect(fetchFn).toHaveBeenCalledWith(SHORT, expect.objectContaining({ redirect: 'manual', headers: { 'User-Agent': MOBILE_UA } }))
  })

  it('相对地址按当前地址解析，还是短链或认不出时继续跟', async () => {
    const { share, fetchFn } = setup(redirect('/Another/'), redirect('https://www.douyin.com/'), redirect(`/video/${ID}`))
    await expect(share.expand(SHORT)).resolves.toBe(`https://www.douyin.com/video/${ID}`)
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([SHORT, 'https://v.douyin.com/Another/', 'https://www.douyin.com/'])
  })

  it.each([
    ['没有跳转', () => new Response(null, { status: 200 })],
    ['跳到别的域名', () => redirect('https://example.com/video/1')],
    ['跳到非网页协议', () => redirect('snssdk1128://aweme/detail/1')]
  ])('%s时报链接打不开', async (_name, response) => {
    const { share, fetchFn } = setup(response)
    const e = await share.expand(SHORT).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(DyUnavailableError)
    expect((e as Error).message).toBe(t('dy.errShortLink'))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('最多跳五次', async () => {
    const { share, fetchFn } = setup(...[1, 2, 3, 4, 5, 6].map((n) => redirect(`https://v.douyin.com/Hop${n}/`)))
    await expect(share.expand(SHORT)).rejects.toThrow(t('dy.errShortLink'))
    expect(fetchFn).toHaveBeenCalledTimes(5)
  })

  it('网络失败翻译成连接错误', async () => {
    const { share } = setup(() => {
      throw new TypeError('fetch failed')
    })
    const e = await share.expand(SHORT).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(DyError)
    expect((e as Error).message).toBe(t('dy.errNetwork', { reason: 'fetch failed' }))
  })

  it('抛出的不是 Error 时直接当原因', async () => {
    const { share } = setup(() => {
      throw '断了'
    })
    await expect(share.expand(SHORT, new AbortController().signal)).rejects.toThrow(t('dy.errNetwork', { reason: '断了' }))
  })

  it('用户取消时原样抛出，取消信号传给了请求', async () => {
    const controller = new AbortController()
    const reason = new Error('取消了')
    const { share, fetchFn } = setup(() => {
      controller.abort(reason)
      throw reason
    })
    await expect(share.expand(SHORT, controller.signal)).rejects.toBe(reason)
    expect(fetchFn.mock.calls[0][1]!.signal!.aborted).toBe(true)
  })

  it('缺省用全局 fetch', async () => {
    const fake = vi.fn(async () => redirect(`https://www.douyin.com/video/${ID}`))
    vi.stubGlobal('fetch', fake)
    await expect(new DouyinShare().expand(SHORT)).resolves.toBe(`https://www.douyin.com/video/${ID}`)
    expect(fake).toHaveBeenCalledTimes(1)
  })
})

describe('detail', () => {
  const item = {
    aweme_id: ID,
    desc: '示例作品',
    video: {
      play_addr: {
        uri: 'v-fake',
        url_list: ['https://cdn.example.com/aweme/v1/playwm/?video_id=v-fake&ratio=720p&line=0']
      },
      bit_rate: [{ gear_name: 'x' }]
    }
  }

  it('先注册匿名 cookie，再从分享页取作品，换成无水印的 1080P 地址', async () => {
    const { share, fetchFn } = setup(TTWID(), videoPage({ item_list: [item] }))
    await expect(share.detail(ID)).resolves.toEqual({
      ...item,
      fromShare: true,
      video: {
        play_addr: { uri: 'v-fake', url_list: ['https://cdn.example.com/aweme/v1/play/?video_id=v-fake&ratio=1080p&line=0'] },
        bit_rate: null
      }
    })
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(fetchFn.mock.calls[0][1]!.body as string)).toMatchObject({ aid: 1768, union: true })
    expect(fetchFn.mock.calls[1][0]).toBe(`https://www.iesdouyin.com/share/video/${ID}/`)
    expect(fetchFn.mock.calls[1][1]!.headers).toEqual({ 'User-Agent': MOBILE_UA, Cookie: 'ttwid=fake-token' })
  })

  it('匿名 cookie 注册一次后重复使用', async () => {
    const { share, fetchFn } = setup(TTWID(), videoPage({ item_list: [item] }), videoPage({ item_list: [item] }))
    await share.detail(ID)
    await share.detail(ID)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('图文作品没有视频字段、视频没有地址时照样返回', async () => {
    const images = [{ url_list: ['https://img.example.com/a.jpeg'] }]
    const { share } = setup(TTWID(), videoPage({ item_list: [{ aweme_id: ID, images }] }), videoPage({ item_list: [{ aweme_id: ID, video: {} }] }), videoPage({ item_list: [{ aweme_id: ID, video: { play_addr: { uri: 'u' } } }] }))
    await expect(share.detail(ID)).resolves.toEqual({ aweme_id: ID, images, fromShare: true, video: undefined })
    expect((await share.detail(ID)).video).toEqual({ play_addr: undefined, bit_rate: null })
    expect((await share.detail(ID)).video!.play_addr).toEqual({ uri: 'u', url_list: undefined })
  })

  it('注册不到 cookie 时报没有数据', async () => {
    const { share } = setup(registered('other=1'))
    const e = await share.detail(ID).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(DyError)
    expect((e as Error).message).toBe(t('dy.errRejected'))
  })

  it.each([
    [{ detail_msg: '已删除', filter_reason: 'gone' }, '已删除'],
    [{ filter_reason: 'gone' }, 'gone'],
    [{}, ID]
  ])('分享页说作品被过滤时报不可用 %#', async (filtered, reason) => {
    const { share } = setup(TTWID(), videoPage({ item_list: [], filter_list: [filtered] }))
    const e = await share.detail(ID).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(DyUnavailableError)
    expect((e as Error).message).toBe(t('dy.errUnavailable', { reason }))
  })

  it.each([
    ['没有数据脚本', () => new Response('<html></html>')],
    ['脚本不是合法 JSON', () => new Response('<script>window._ROUTER_DATA = {bad}</script>')],
    ['没有 loaderData', () => new Response('<script>window._ROUTER_DATA = {}</script>')],
    ['没有作品信息', () => page({ layout: null })],
    ['列表为空', () => videoPage({})]
  ])('%s时报错，下次重新注册 cookie', async (_name, bad) => {
    const { share, fetchFn } = setup(TTWID(), bad, TTWID(), videoPage({ item_list: [item] }))
    await expect(share.detail(ID)).rejects.toThrow(t('dy.errRejected'))
    await expect(share.detail(ID)).resolves.toMatchObject({ aweme_id: ID })
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })
})
