import type { CloseAction } from '@shared/types'

export type Bounds = { x: number; y: number; width: number; height: number }

/** 上次的窗口位置；和哪块屏幕的工作区都不相交（显示器已经不在了）就只沿用大小 */
export function restoreBounds(saved: Bounds | undefined, workAreas: Bounds[]): Partial<Bounds> {
  if (!saved) return {}
  const visible = workAreas.some(
    (a) => saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y + saved.height > a.y
  )
  return visible ? saved : { width: saved.width, height: saved.height }
}

/**
 * 点了窗口的关闭按钮：确认退出后、或者页面崩了没法弹询问时照常关掉（allow），
 * 否则按设置退出、转到后台，或者让页面弹出询问（ask）
 */
export function closeDecision(o: { quitting: boolean; crashed: boolean; action: CloseAction }): 'allow' | 'quit' | 'hide' | 'ask' {
  if (o.quitting || o.crashed) return 'allow'
  if (o.action === 'quit') return 'quit'
  if (o.action === 'background') return 'hide'
  return 'ask'
}

/**
 * 所有窗口都关了要不要退出。只有主窗口被关掉才退出：抖音的隐藏网页、登录窗口自己关掉时
 * （后台启动时没有主窗口）应用要继续在托盘里运行
 */
export const quitWhenAllClosed = (o: { isMac: boolean; mainClosed: boolean }): boolean => !o.isMac && o.mainClosed

