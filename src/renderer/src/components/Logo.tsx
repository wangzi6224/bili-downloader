import { useId } from 'react'

/** 应用图标的同款图形（build/icon.svg 去掉留白和投影），用在侧边栏和空状态 */
export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  // useId 里的特殊字符不能直接放进 url(#…)
  const id = `logo${useId().replace(/[^\w-]/g, '')}`
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
