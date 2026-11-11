import { useEffect, useEffectEvent, useState } from 'react'

/** 浏览时在列表末尾取下一页，搜索时继续查阅后续分页。 */
export function useLazyNextPage(enabled: boolean, page: number, query: string, load: () => Promise<void>) {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const loadNext = useEffectEvent(load)

  useEffect(() => {
    if (!enabled || !sentinel) return
    if (!query && typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (): void => {
      timer ??= setTimeout(() => void loadNext(), 800)
    }
    const observer = query ? undefined : new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) schedule()
      else {
        clearTimeout(timer)
        timer = undefined
      }
    })
    if (observer) observer.observe(sentinel)
    else schedule()
    return () => {
      observer?.disconnect()
      clearTimeout(timer)
    }
  }, [enabled, page, query, sentinel])

  return setSentinel
}
