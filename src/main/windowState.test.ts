import { describe, expect, it } from 'vitest'
import { closeDecision, restoreBounds } from './windowState'

const builtIn = { x: 0, y: 0, width: 1440, height: 875 }
const external = { x: 1440, y: 0, width: 1920, height: 1055 }

describe('restoreBounds', () => {
  it('没有保存过就用默认位置和大小', () => {
    expect(restoreBounds(undefined, [builtIn])).toEqual({})
  })

  it('还在某块屏幕里（哪怕只露出一部分）就原样恢复', () => {
    const partly = { x: 1300, y: 100, width: 800, height: 600 }
    expect(restoreBounds(partly, [builtIn])).toBe(partly)
    const onExternal = { x: 2000, y: 50, width: 800, height: 600 }
    expect(restoreBounds(onExternal, [builtIn, external])).toBe(onExternal)
  })

  it('所在的显示器不在了就只沿用大小', () => {
    expect(restoreBounds({ x: 2000, y: 50, width: 800, height: 600 }, [builtIn])).toEqual({ width: 800, height: 600 })
  })

  it('只是贴着屏幕边缘不算在屏幕里', () => {
    expect(restoreBounds({ x: 1440, y: 0, width: 800, height: 600 }, [builtIn])).toEqual({ width: 800, height: 600 })
    expect(restoreBounds({ x: 0, y: -600, width: 800, height: 600 }, [builtIn])).toEqual({ width: 800, height: 600 })
  })
})

describe('closeDecision', () => {
  it.each([
    [{ quitting: true, crashed: false, action: 'ask' }, 'allow'],
    [{ quitting: false, crashed: true, action: 'background' }, 'allow'],
    [{ quitting: false, crashed: false, action: 'quit' }, 'quit'],
    [{ quitting: false, crashed: false, action: 'background' }, 'hide'],
    [{ quitting: false, crashed: false, action: 'ask' }, 'ask']
  ] as const)('%o → %s', (o, want) => {
    expect(closeDecision(o)).toBe(want)
  })
})
