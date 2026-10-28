import type { BiliApi } from '@shared/types'

declare global {
  interface Window {
    api: BiliApi
  }
}
