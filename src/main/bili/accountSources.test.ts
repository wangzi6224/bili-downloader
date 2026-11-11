import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseInput } from '@shared/parseUrl'
import type { AccountSourceCategory, AccountSourceTarget } from '@shared/types'

const h = vi.hoisted(() => ({ api: vi.fn(), myFavFolders: vi.fn() }))
vi.mock('./http', () => ({ api: h.api }))
vi.mock('./lists', () => ({ myFavFolders: h.myFavFolders }))
const { accountSourceInput, listAccountSources } = await import('./accountSources')

beforeEach(() => vi.resetAllMocks())

describe('B 站账号来源', () => {
  it.each<[AccountSourceCategory, number]>([['anime', 1], ['cinema', 2]])('分页读取 %s 的剧集 ID', async (category, type) => {
    const list = [{ season_id: 12, title: '番剧', cover: 'cover.jpg' }, { season_id: 0, title: '没有剧集 ID' }]
    h.api.mockResolvedValue({ list, total: 3, ps: 2 })
    expect(await listAccountSources(7, category, 1)).toEqual({
      items: [{ key: 'pgc:12', title: '番剧', cover: 'cover.jpg', target: { type: 'pgc', seasonId: 12 } }],
      hasMore: true
    })
    expect(h.api).toHaveBeenCalledWith(
      'https://api.bilibili.com/x/space/bangumi/follow/list',
      { vmid: 7, type, follow_status: 0, pn: 1, ps: 20 },
      { noRiskRetry: true }
    )
    expect((await listAccountSources(7, category, 2)).hasMore).toBe(false)
  })

  it('使用合集发布者和合集 ID，收藏夹使用完整的 media ID', async () => {
    h.api.mockResolvedValue({
      count: 25,
      list: [
        { id: 11, upper: { mid: 42 }, mid: 7, type: 21, title: '合集' },
        { id: 12, mid: 42, type: 'collection', title: '另一合集' },
        { id: 0, media_id: 332, type: 11, title: '收藏夹', cover: 'folder.jpg' },
        { id: 14, type: 21, title: '没有发布者' },
        { title: '没有 ID' }
      ]
    })
    const result = await listAccountSources(7, 'collected', 1)
    expect(h.api).toHaveBeenCalledWith(
      'https://api.bilibili.com/x/v3/fav/folder/collected/list',
      { up_mid: 7, pn: 1, ps: 20, platform: 'web' },
      { noRiskRetry: true }
    )
    expect(result.hasMore).toBe(true)
    expect(result.items.map(({ target }) => target)).toEqual([
      { type: 'spaceSeason', ownerMid: 42, seasonId: 11 },
      { type: 'spaceSeason', ownerMid: 42, seasonId: 12 },
      { type: 'fav', mediaId: 332 }
    ])
    h.api.mockResolvedValue({ count: 25, list: [{ id: 333, title: '收藏夹' }], has_more: false })
    expect((await listAccountSources(7, 'collected', 1)).hasMore).toBe(false)
  })

  it('空列表停在当前页，账号自己的收藏夹只读取一次', async () => {
    h.api.mockResolvedValue(null)
    expect(await listAccountSources(7, 'anime', 1)).toEqual({ items: [], hasMore: false })
    expect(await listAccountSources(7, 'collected', 1)).toEqual({ items: [], hasMore: false })
    h.myFavFolders.mockResolvedValue([{ id: 31, title: '默认' }])
    expect((await listAccountSources(7, 'folders', 1)).items).toMatchObject([{ key: 'fav:31' }])
    expect(await listAccountSources(7, 'folders', 2)).toEqual({ items: [], hasMore: false })
    expect(h.myFavFolders.mock.calls).toEqual([[7]])
    await expect(listAccountSources(7, 'anime', 0)).rejects.toThrow()
    await expect(listAccountSources(7, 'invalid' as AccountSourceCategory, 1)).rejects.toThrow()
  })

  it.each<{ target: AccountSourceTarget; expected: object }>([
    { target: { type: 'pgc', seasonId: 11 }, expected: { type: 'pgc', seasonId: 11 } },
    { target: { type: 'spaceSeason', ownerMid: 42, seasonId: 12 }, expected: { type: 'spaceSeason', mid: 42, seasonId: 12 } },
    { target: { type: 'fav', mediaId: 332 }, expected: { type: 'fav', mediaId: 332 } },
    { target: { type: 'watchlater' }, expected: { type: 'watchlater' } }
  ])('生成已有解析器可打开的 $target.type 来源', ({ target, expected }) => {
    expect(parseInput(accountSourceInput(target))).toEqual(expected)
  })

  it.each<AccountSourceTarget>([
    { type: 'pgc', seasonId: 0 },
    { type: 'spaceSeason', ownerMid: -1, seasonId: 12 },
    { type: 'fav', mediaId: NaN }
  ])('拒绝无效的 $type ID', (target) => {
    expect(() => accountSourceInput(target)).toThrow()
  })
})
