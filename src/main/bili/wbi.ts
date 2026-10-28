import { createHash } from 'node:crypto'

// WBI 签名，算法见 SocialSisterYi/bilibili-API-collect 的 docs/misc/sign/wbi.md
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
]

export function getMixinKey(imgKey: string, subKey: string): string {
  const orig = imgKey + subKey
  return MIXIN_KEY_ENC_TAB.map((i) => orig[i])
    .join('')
    .slice(0, 32)
}

/** 从 nav 返回的 wbi_img.img_url / sub_url 中取出文件名作为 key */
export function keyFromUrl(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1).split('.')[0]
}

export function encWbi(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
  wts = Math.round(Date.now() / 1000)
): string {
  const mixinKey = getMixinKey(imgKey, subKey)
  const all: Record<string, string | number> = { ...params, wts }
  const query = Object.keys(all)
    .sort()
    .map((k) => {
      const v = String(all[k]).replace(/[!'()*]/g, '')
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    })
    .join('&')
  const wRid = createHash('md5')
    .update(query + mixinKey)
    .digest('hex')
  return `${query}&w_rid=${wRid}`
}
