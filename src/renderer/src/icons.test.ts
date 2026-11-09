import { describe, expect, it } from 'vitest'
import { WatermarkOff } from './icons'

describe('自绘图标', () => {
  it('和 lucide 图标一样是 React 组件，名字按图标名生成', () => {
    expect(WatermarkOff.displayName).toBe('WatermarkOff')
    expect(typeof WatermarkOff).toBe('object')
  })
})
