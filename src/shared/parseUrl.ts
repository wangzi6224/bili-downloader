export type Target =
  | { type: 'short'; url: string }
  | { type: 'ugc'; bvid?: string; aid?: number; page?: number }
  | { type: 'pgc'; epId?: number; seasonId?: number; mediaId?: number }

const SHORT_HOSTS = /^(?:https?:\/\/)?(?:b23\.tv|bili2233\.cn|bili22\.cn|bili23\.cn|bili33\.cn)\/\S+/i

/** 从粘贴内容（可能是带标题的分享文案）中识别出要下载的对象 */
export function parseInput(input: string): Target | null {
  const text = input.trim()
  if (!text) return null
  const url = text.match(/(?:https?:\/\/)?[\w.-]*(?:bilibili\.com|b23\.tv|bili2233\.cn|bili2[23]\.cn|bili33\.cn)\/[^\s"'<>，。】）]*/i)?.[0]
  const raw = url ?? text

  if (SHORT_HOSTS.test(raw)) {
    return { type: 'short', url: raw.startsWith('http') ? raw : `https://${raw}` }
  }

  const pgc = raw.match(/bangumi\/play\/(ep|ss)(\d+)/i) ?? text.match(/^(ep|ss)(\d+)$/i)
  if (pgc) {
    const id = Number(pgc[2])
    return pgc[1].toLowerCase() === 'ep' ? { type: 'pgc', epId: id } : { type: 'pgc', seasonId: id }
  }
  const md = raw.match(/bangumi\/media\/md(\d+)/i) ?? text.match(/^md(\d+)$/i)
  if (md) return { type: 'pgc', mediaId: Number(md[1]) }

  let page: number | undefined
  try {
    const p = Number(new URL(raw.startsWith('http') ? raw : `https://${raw}`).searchParams.get('p'))
    if (p > 0) page = p
  } catch {
    // 不是 URL
  }

  const bv = raw.match(/BV[0-9A-Za-z]{10}/i)
  if (bv) return { type: 'ugc', bvid: `BV${bv[0].slice(2)}`, page }
  const av = raw.match(/(?:^|\/|\b)av(\d+)/i)
  if (av) return { type: 'ugc', aid: Number(av[1]), page }

  return null
}

/** 粗略判断一段文本里是否有 B站链接（用于剪贴板检测） */
export function looksLikeBili(text: string): boolean {
  return parseInput(text) !== null
}
