import { useId } from 'react'
import { SITES } from '@shared/site'
import type { Site } from '@shared/types'

// 应用图标的同款图形（build/icon.svg、icon-youtube.svg 去掉留白和投影）

function BiliMark({ id, size, className }: { id: string; size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF94B8" />
          <stop offset="1" stopColor="#F0568A" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="36" fill={`url(#${id})`} />
      <rect x="28" y="53.6" width="104" height="73.8" rx="18.6" fill="#fff" fillOpacity="0.16" />
      <g fill="none" stroke="#fff" strokeWidth="9.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="28" y="53.6" width="104" height="73.8" rx="18.6" />
        <path d="M58.3 53.6 L46.2 33 M101.7 53.6 L113.8 33" />
        <path d="M80 71.5 V106.8 M65.6 92.8 L80 107.2 L94.4 92.8" />
      </g>
    </svg>
  )
}

/** YouTube 主题的标志：屏幕去掉天线、下面一条播放进度条；刻意不用红底白三角，避免和 YouTube 的标志混淆 */
function YoutubeMark({ id, size, className }: { id: string; size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF5A6E" />
          <stop offset="1" stopColor="#D9001B" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="36" fill={`url(#${id})`} />
      <rect x="24.5" y="39.2" width="111" height="81.6" rx="20.2" fill="#fff" fillOpacity="0.16" />
      <g fill="none" stroke="#fff" strokeWidth="9.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="24.5" y="39.2" width="111" height="81.6" rx="20.2" />
        <path d="M80 58.3 V91.7 M66 78.5 L80 92.4 L94 78.5" />
        <path d="M24.5 138.3 H135.5" strokeOpacity="0.45" />
        <path d="M24.5 138.3 H89.3" />
      </g>
      <circle cx="89.3" cy="138.3" r="7.4" fill="#fff" />
    </svg>
  )
}

/** 抖音主题的标志：竖屏里一个下载箭头，右上角一个红点；刻意不用音符图形，避免和抖音的标志混淆 */
function DouyinMark({ id, size, className }: { id: string; size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35D6CF" />
          <stop offset="1" stopColor="#068C88" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="36" fill={`url(#${id})`} />
      <rect x="43" y="26" width="74" height="108" rx="20" fill="#fff" fillOpacity="0.16" />
      <g fill="none" stroke="#fff" strokeWidth="9.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="43" y="26" width="74" height="108" rx="20" />
        <path d="M80 55 V91 M66 78 L80 92 L94 78" />
        <path d="M68 114 H92" />
      </g>
      <circle cx="117" cy="30" r="12" fill="#FE2C55" stroke="#fff" strokeWidth="5" />
    </svg>
  )
}

/** useId 里的特殊字符不能直接放进 url(#…) */
const useSvgId = (): string => `logo${useId().replace(/[^\w-]/g, '')}`

const MARKS: Record<Site, typeof BiliMark> = { bili: BiliMark, youtube: YoutubeMark, douyin: DouyinMark }

/** 某个平台固定的标志（例如平台切换器里） */
export function SiteMark({ site, size = 16, className = '' }: { site: Site; size?: number; className?: string }) {
  const id = useSvgId()
  const Mark = MARKS[site]
  return <Mark id={id} size={size} className={className} />
}

/**
 * 当前界面平台的标志，用在侧栏和空状态。各平台的标志叠在一起，由 <html data-brand> 决定显示哪个，
 * 切换时交叉淡入、轻微旋转缩放（index.css 的 .logo-mark）
 */
export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useSvgId()
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {SITES.map((site) => {
        const Mark = MARKS[site]
        return <Mark key={site} id={`${id}${site}`} size={size} className={`logo-mark logo-${site} absolute inset-0`} />
      })}
    </span>
  )
}
