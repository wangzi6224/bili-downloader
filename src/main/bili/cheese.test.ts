import { beforeEach, describe, expect, it, vi } from 'vitest'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: { wbi?: boolean }) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { parseCheese } = await import('./cheese')

const SEASON = 'https://api.bilibili.com/pugv/view/web/season'

const ep = (id: number) => ({ id, aid: id * 10, cid: id * 100, title: `第 ${id} 节`, duration: 600, release_date: 1700000000 + id, cover: `ep${id}.jpg` })

beforeEach(() => {
  api.mockReset().mockResolvedValue({
    season_id: 66,
    title: '课程名',
    subtitle: '课程简介',
    cover: 'course.jpg',
    up_info: { mid: 3, uname: '老师' },
    episodes: [ep(1), ep(2), ep(3)]
  })
})

describe('parseCheese', () => {
  it('epId 时按 ep_id 请求，默认选中那一节', async () => {
    const r = await parseCheese({ epId: 2, seasonId: 66 })
    expect(api).toHaveBeenCalledWith(SEASON, { ep_id: 2 })
    expect(r.defaultSelected).toEqual(['cheese:2'])
    expect(r).toMatchObject({
      kind: 'cheese',
      title: '课程名',
      cover: 'course.jpg',
      owner: '老师',
      meta: { desc: '课程简介', owner: '老师', ownerMid: 3, url: 'https://www.bilibili.com/cheese/play/ss66' }
    })
    expect(r.groups).toEqual([
      {
        id: 'cheese',
        title: '课程',
        items: [1, 2, 3].map((id, i) => ({
          key: `cheese:${id}`,
          kind: 'cheese',
          title: `第 ${id} 节`,
          index: i + 1,
          cid: id * 100,
          aid: id * 10,
          epId: id,
          cover: `ep${id}.jpg`,
          duration: 600,
          pubdate: 1700000000 + id
        }))
      }
    ])
  })

  it('seasonId 时按 season_id 请求并全选', async () => {
    const r = await parseCheese({ seasonId: 66 })
    expect(api).toHaveBeenCalledWith(SEASON, { season_id: 66 })
    expect(r.defaultSelected).toEqual(['cheese:1', 'cheese:2', 'cheese:3'])
  })

  it('epId 找不到对应的一节时全选', async () => {
    const r = await parseCheese({ epId: 999 })
    expect(r.defaultSelected).toEqual(['cheese:1', 'cheese:2', 'cheese:3'])
  })

  it('没有 UP 信息时 owner 为空', async () => {
    api.mockResolvedValue({ season_id: 1, title: 't', cover: '', episodes: [] })
    const r = await parseCheese({ seasonId: 1 })
    expect(r.owner).toBeUndefined()
    expect(r.meta).toMatchObject({ owner: undefined, ownerMid: undefined })
    expect(r.defaultSelected).toEqual([])
  })
})
