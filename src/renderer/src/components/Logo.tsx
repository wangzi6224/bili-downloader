import { useId } from 'react'
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

/** useId 里的特殊字符不能直接放进 url(#…) */
const useSvgId = (): string => `logo${useId().replace(/[^\w-]/g, '')}`

/** 某个平台固定的标志（例如平台切换器里） */
export function SiteMark({ site, size = 16, className = '' }: { site: Site; size?: number; className?: string }) {
  const id = useSvgId()
  return site === 'youtube' ? <YoutubeMark id={id} size={size} className={className} /> : <BiliMark id={id} size={size} className={className} />
}

/**
 * 当前界面平台的标志，用在侧栏和空状态。两个标志叠在一起，由 <html data-brand> 决定显示哪个，
 * 切换时交叉淡入、轻微旋转缩放（index.css 的 .logo-mark）
 */
export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useSvgId()
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <BiliMark id={`${id}b`} size={size} className="logo-mark logo-bili absolute inset-0" />
      <YoutubeMark id={`${id}y`} size={size} className="logo-mark logo-youtube absolute inset-0" />
    </span>
  )
}
