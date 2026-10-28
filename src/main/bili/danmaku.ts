import { inflateRawSync } from 'node:zlib'
import { BASE_HEADERS } from './http'

export interface Danmaku {
  time: number
  mode: number
  size: number
  color: number
  text: string
}

export interface AssOptions {
  /** 基准字号（B站播放器里的像素值，默认 25） */
  fontSize: number
  opacity: number
  /** 滚动弹幕在屏幕上停留的秒数 */
  duration: number
}

const W = 1920
const H = 1080
const FIXED_DURATION = 4

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

export function parseDanmakuXml(xml: string): Danmaku[] {
  const out: Danmaku[] = []
  for (const m of xml.matchAll(/<d p="([^"]+)">([^<]*)<\/d>/g)) {
    const [time, mode, size, color] = m[1].split(',').map(Number)
    // 7 高级弹幕、8 代码弹幕无法用 ASS 还原
    if (mode > 6) continue
    out.push({ time, mode, size, color, text: decodeEntities(m[2]) })
  }
  return out.sort((a, b) => a.time - b.time)
}

function assTime(sec: number): string {
  const cs = Math.round(sec * 100)
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`
}

const assColor = (rgb: number): string => {
  const r = (rgb >> 16) & 0xff
  const g = (rgb >> 8) & 0xff
  const b = rgb & 0xff
  return [b, g, r].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()
}

const escapeText = (s: string): string =>
  s.replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝').replace(/\r?\n/g, '\\N')

/** 粗略估算文字宽度：全角 1em，半角 0.5em */
const textWidth = (s: string, px: number): number =>
  [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? px : px * 0.55), 0)

export function toAss(list: Danmaku[], o: AssOptions): string {
  const basePx = Math.round(o.fontSize * 2) // B站播放器约 540 像素高，换算到 1080
  const rowH = basePx + 6
  const rows = Math.floor(H / rowH)
  const alpha = Math.round((1 - o.opacity) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()

  // 每行在什么时候之后可以放下一条，分滚动/顶部/底部三套
  const scrollFree = new Array<number>(rows).fill(-Infinity)
  const topFree = new Array<number>(rows).fill(-Infinity)
  const bottomFree = new Array<number>(rows).fill(-Infinity)
  const pickRow = (free: number[], t: number): number => {
    const idx = free.findIndex((f) => f <= t)
    if (idx >= 0) return idx
    return free.indexOf(Math.min(...free))
  }

  const events: string[] = []
  for (const d of list) {
    const px = Math.round((basePx * d.size) / 25)
    const text = escapeText(d.text)
    const color = d.color === 0xffffff ? '' : `\\c&H${assColor(d.color)}&`
    const fs = px === basePx ? '' : `\\fs${px}`
    const w = textWidth(d.text, px)

    if (d.mode === 4 || d.mode === 5) {
      const free = d.mode === 5 ? topFree : bottomFree
      const row = pickRow(free, d.time)
      free[row] = d.time + FIXED_DURATION
      const y = d.mode === 5 ? row * rowH : H - row * rowH
      const align = d.mode === 5 ? 8 : 2
      events.push(
        `Dialogue: 2,${assTime(d.time)},${assTime(d.time + FIXED_DURATION)},Danmaku,,0,0,0,,{\\an${align}\\pos(${W / 2},${y})${color}${fs}}${text}`
      )
      continue
    }

    const speed = (W + w) / o.duration
    const row = pickRow(scrollFree, d.time)
    // 下一条要等这一条的尾巴完全进入屏幕，再留一点间距
    scrollFree[row] = d.time + (w + px) / speed
    const y = row * rowH
    events.push(
      `Dialogue: 1,${assTime(d.time)},${assTime(d.time + o.duration)},Danmaku,,0,0,0,,{\\an7\\move(${W},${y},${Math.round(-w)},${y})${color}${fs}}${text}`
    )
  }

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Danmaku,PingFang SC,${basePx},&H${alpha}FFFFFF,&H${alpha}FFFFFF,&H${alpha}000000,&H${alpha}000000,1,0,0,0,100,100,0,0,1,1.5,0,7,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    ''
  ].join('\n')
}

export async function fetchDanmakuXml(cid: number): Promise<string> {
  const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
    headers: { ...BASE_HEADERS, 'Accept-Encoding': 'identity' }
  })
  if (!res.ok) throw new Error(`弹幕下载失败（HTTP ${res.status}）`)
  const buf = Buffer.from(await res.arrayBuffer())
  // 接口有时直接返回未声明的 raw deflate
  if (buf[0] === 0x3c) return buf.toString('utf8')
  return inflateRawSync(buf).toString('utf8')
}
