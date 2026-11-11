import { t } from '@shared/i18n'
import type { AccountSource, AccountSourceCategory, AccountSourcePage, AccountSourceTarget } from '@shared/types'
import { api } from './http'
import { myFavFolders } from './lists'

const PAGE_SIZE = 20
const COLLECTION_TYPE = 21

interface FollowedSeason {
  season_id: number
  title: string
  cover?: string
}

interface CollectedFolder {
  id?: number
  media_id?: number
  type?: number | string
  mid?: number
  upper?: { mid?: number }
  title: string
  cover?: string
}

const isId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0

function favorite(mediaId: number, title: string, cover?: string): AccountSource {
  return { key: `fav:${mediaId}`, title, cover, target: { type: 'fav', mediaId } }
}

export async function listAccountSources(mid: number, category: AccountSourceCategory, page: number): Promise<AccountSourcePage> {
  if (!isId(page)) throw new Error(t('subs.sourceUnavailable'))
  switch (category) {
    case 'folders': {
      const folders = page === 1 ? await myFavFolders(mid) : []
      return { items: folders.map(({ id, title }) => favorite(id, title)), hasMore: false }
    }
    case 'anime':
    case 'cinema': {
      const data = await api<{ list: FollowedSeason[] | null; total: number; ps?: number } | null>(
        'https://api.bilibili.com/x/space/bangumi/follow/list',
        { vmid: mid, type: category === 'anime' ? 1 : 2, follow_status: 0, pn: page, ps: PAGE_SIZE },
        { noRiskRetry: true }
      )
      const list = data?.list ?? []
      const items = list.filter((season) => isId(season.season_id)).map((season): AccountSource => ({
        key: `pgc:${season.season_id}`,
        title: season.title,
        cover: season.cover,
        target: { type: 'pgc', seasonId: season.season_id }
      }))
      return { items, hasMore: list.length > 0 && page * (data?.ps || PAGE_SIZE) < (data?.total ?? 0) }
    }
    case 'collected': {
      const data = await api<{ list: CollectedFolder[] | null; count: number; has_more?: boolean } | null>(
        'https://api.bilibili.com/x/v3/fav/folder/collected/list',
        { up_mid: mid, pn: page, ps: PAGE_SIZE, platform: 'web' },
        { noRiskRetry: true }
      )
      const list = data?.list ?? []
      const items = list.flatMap((entry): AccountSource[] => {
        const id = isId(entry.id) ? entry.id : entry.media_id
        if (!isId(id)) return []
        if (entry.type !== COLLECTION_TYPE && entry.type !== 'collection') return [favorite(id, entry.title, entry.cover)]
        const ownerMid = isId(entry.upper?.mid) ? entry.upper.mid : entry.mid
        if (!isId(ownerMid)) return []
        return [{
          key: `season:${ownerMid}:${id}`,
          title: entry.title,
          cover: entry.cover,
          target: { type: 'spaceSeason', ownerMid, seasonId: id }
        }]
      })
      return { items, hasMore: list.length > 0 && (data?.has_more ?? page * PAGE_SIZE < (data?.count ?? 0)) }
    }
    default:
      throw new Error(t('subs.sourceUnavailable'))
  }
}

export function accountSourceInput(target: AccountSourceTarget): string {
  switch (target.type) {
    case 'pgc':
      if (isId(target.seasonId)) return `https://www.bilibili.com/bangumi/play/ss${target.seasonId}`
      break
    case 'spaceSeason':
      if (isId(target.ownerMid) && isId(target.seasonId)) {
        return `https://space.bilibili.com/${target.ownerMid}/lists/${target.seasonId}?type=season`
      }
      break
    case 'fav':
      if (isId(target.mediaId)) return `https://www.bilibili.com/medialist/detail/ml${target.mediaId}`
      break
    case 'watchlater':
      return 'https://www.bilibili.com/watchlater'
  }
  throw new Error(t('subs.sourceUnavailable'))
}
