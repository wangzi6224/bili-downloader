import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ next: 1, start: vi.fn(), stop: vi.fn() }))
vi.mock('electron', () => ({ powerSaveBlocker: { start: h.start, stop: h.stop } }))

let power: typeof import('./power')

beforeEach(async () => {
  vi.resetModules()
  h.start.mockReset().mockImplementation(() => h.next++)
  h.stop.mockReset()
  power = await import('./power')
})

describe('applyPower', () => {
  it('空闲或设为不阻止时什么都不做', () => {
    power.applyPower(false, 'display')
    power.applyPower(true, 'off')
    expect(h.start).not.toHaveBeenCalled()
    expect(power.powerBlocking()).toBe(false)
  })

  it('按模式选择阻止类型', () => {
    power.applyPower(true, 'display')
    expect(h.start).toHaveBeenLastCalledWith('prevent-display-sleep')
    power.applyPower(true, 'system')
    expect(h.start).toHaveBeenLastCalledWith('prevent-app-suspension')
    expect(power.powerBlocking()).toBe(true)
  })

  it('同一种阻止不重复开启', () => {
    power.applyPower(true, 'display')
    power.applyPower(true, 'display')
    expect(h.start).toHaveBeenCalledOnce()
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('切换模式时先释放旧的', () => {
    power.applyPower(true, 'display')
    const first = h.start.mock.results[0].value
    power.applyPower(true, 'system')
    expect(h.stop).toHaveBeenCalledWith(first)
    expect(h.stop.mock.invocationCallOrder[0]).toBeLessThan(h.start.mock.invocationCallOrder[1])
  })

  it('下载结束或改成不阻止时释放', () => {
    power.applyPower(true, 'display')
    power.applyPower(false, 'display')
    expect(h.stop).toHaveBeenCalledOnce()
    expect(power.powerBlocking()).toBe(false)
    power.applyPower(true, 'system')
    power.applyPower(true, 'off')
    expect(h.stop).toHaveBeenCalledTimes(2)
    expect(power.powerBlocking()).toBe(false)
  })
})
