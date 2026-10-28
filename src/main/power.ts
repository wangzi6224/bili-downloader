import { powerSaveBlocker } from 'electron'
import type { PowerMode } from '@shared/types'

type BlockerType = 'prevent-app-suspension' | 'prevent-display-sleep'

let current: { id: number; type: BlockerType } | null = null

/** 有下载在进行时按设置阻止系统睡眠或保持屏幕常亮，空闲时释放 */
export function applyPower(active: boolean, mode: PowerMode): void {
  const want: BlockerType | null =
    !active || mode === 'off' ? null : mode === 'display' ? 'prevent-display-sleep' : 'prevent-app-suspension'
  if (current?.type === want) return
  if (current) {
    powerSaveBlocker.stop(current.id)
    current = null
  }
  if (want) current = { id: powerSaveBlocker.start(want), type: want }
}

export const powerBlocking = (): boolean => current !== null
