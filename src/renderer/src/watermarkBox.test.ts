import { describe, expect, it } from 'vitest'
import { dragRect, handleStyle, HANDLES, nextFrameTime, nudge, toView } from './watermarkBox'

const W = 1920
const H = 1080
const R = { x: 100, y: 50, w: 200, h: 40 }

describe('dragRect', () => {
  it('整体移动，碰到画面边缘就停（离边留 1 像素）', () => {
    expect(dragRect(R, 'move', 10.4, -5.6, W, H)).toEqual({ x: 110, y: 44, w: 200, h: 40 })
    expect(dragRect(R, 'move', -500, -500, W, H)).toEqual({ x: 1, y: 1, w: 200, h: 40 })
    expect(dragRect(R, 'move', 5000, 5000, W, H)).toEqual({ x: 1719, y: 1039, w: 200, h: 40 })
  })

  it('拖边和角只改对应的边', () => {
    expect(dragRect(R, 'e', 30, 99, W, H)).toEqual({ x: 100, y: 50, w: 230, h: 40 })
    expect(dragRect(R, 'w', -30, 99, W, H)).toEqual({ x: 70, y: 50, w: 230, h: 40 })
    expect(dragRect(R, 'n', 99, -10, W, H)).toEqual({ x: 100, y: 40, w: 200, h: 50 })
    expect(dragRect(R, 's', 99, 10, W, H)).toEqual({ x: 100, y: 50, w: 200, h: 50 })
    expect(dragRect(R, 'nw', -10, -10, W, H)).toEqual({ x: 90, y: 40, w: 210, h: 50 })
    expect(dragRect(R, 'se', 10.6, 10.4, W, H)).toEqual({ x: 100, y: 50, w: 211, h: 50 })
  })

  it('缩放时保留最小边长，也不超出画面', () => {
    expect(dragRect(R, 'e', -500, 0, W, H)).toEqual({ x: 100, y: 50, w: 8, h: 40 })
    expect(dragRect(R, 'w', 500, 0, W, H)).toEqual({ x: 292, y: 50, w: 8, h: 40 })
    expect(dragRect(R, 'n', 0, 500, W, H, 20)).toEqual({ x: 100, y: 70, w: 200, h: 20 })
    expect(dragRect(R, 'se', 5000, 5000, W, H)).toEqual({ x: 100, y: 50, w: 1819, h: 1029 })
    expect(dragRect(R, 'nw', -5000, -5000, W, H)).toEqual({ x: 1, y: 1, w: 299, h: 89 })
  })
})

describe('其他', () => {
  it('nudge：方向键移动 1 像素，Shift 移动 10 像素，别的键不处理', () => {
    expect(nudge(R, 'ArrowLeft', false, W, H)).toEqual({ ...R, x: 99 })
    expect(nudge(R, 'ArrowRight', true, W, H)).toEqual({ ...R, x: 110 })
    expect(nudge(R, 'ArrowUp', true, W, H)).toEqual({ ...R, y: 40 })
    expect(nudge(R, 'ArrowDown', false, W, H)).toEqual({ ...R, y: 51 })
    expect(nudge(R, 'Enter', false, W, H)).toBeNull()
  })

  it('toView 按比例换算', () => {
    expect(toView(R, 0.5)).toEqual({ x: 50, y: 25, w: 100, h: 20 })
  })

  it('nextFrameTime 依次取 10%、30%…90%，到头了回到第一个', () => {
    expect(nextFrameTime(100, 0)).toBe(10)
    expect(nextFrameTime(100, 30)).toBe(50)
    expect(nextFrameTime(100, 31)).toBe(50)
    expect(nextFrameTime(100, 90)).toBe(10)
    expect(nextFrameTime(33.3333, 9.99999)).toBe(16.667)
  })

  it('handleStyle：位置和鼠标样式', () => {
    expect(HANDLES.map((h) => handleStyle(h))).toEqual([
      { left: '0%', top: '0%', cursor: 'nwse-resize' },
      { left: '50%', top: '0%', cursor: 'ns-resize' },
      { left: '100%', top: '0%', cursor: 'nesw-resize' },
      { left: '100%', top: '50%', cursor: 'ew-resize' },
      { left: '100%', top: '100%', cursor: 'nwse-resize' },
      { left: '50%', top: '100%', cursor: 'ns-resize' },
      { left: '0%', top: '100%', cursor: 'nesw-resize' },
      { left: '0%', top: '50%', cursor: 'ew-resize' }
    ])
  })
})
