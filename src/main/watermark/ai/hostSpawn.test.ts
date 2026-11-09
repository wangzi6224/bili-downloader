import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock('electron', () => ({ utilityProcess: { fork: h.fork }, app: { getPath: () => '/tmp/bili-ai-index' } }))

const { spawnHost } = await import('./hostSpawn')

class FakeChild extends EventEmitter {
  postMessage = vi.fn()
  kill = vi.fn(() => true)
}

describe('spawnHost', () => {
  it('用 utilityProcess 启动 refineHost.js，收发消息；退出后不再发消息、不再结束', () => {
    const child = new FakeChild()
    h.fork.mockReturnValue(child)
    const ch = spawnHost()
    expect(h.fork.mock.calls[0][0]).toMatch(/refineHost\.js$/)
    expect(h.fork.mock.calls[0][2]).toMatchObject({ stdio: 'ignore' })
    const got: unknown[] = []
    const exits: (number | null)[] = []
    ch.onMessage((m) => got.push(m))
    ch.onExit((c) => exits.push(c))
    ch.send({ type: 'init', model: 'm', backend: 'cpu', threads: 1 })
    expect(child.postMessage).toHaveBeenCalledTimes(1)
    child.emit('message', { type: 'ready', backend: 'cpu', ms: 1 })
    expect(got).toEqual([{ type: 'ready', backend: 'cpu', ms: 1 }])
    ch.kill()
    expect(child.kill).toHaveBeenCalledTimes(1)
    child.emit('exit', 0)
    expect(exits).toEqual([0])
    ch.send({ type: 'init', model: 'm', backend: 'cpu', threads: 1 })
    ch.kill()
    expect(child.postMessage).toHaveBeenCalledTimes(1)
    expect(child.kill).toHaveBeenCalledTimes(1)
  })
})

describe('单例', () => {
  it('模型和会话各只有一个', async () => {
    const { aiModel, aiSessions } = await import('./index')
    expect(aiModel()).toBe(aiModel())
    expect(aiSessions()).toBe(aiSessions())
  })
})
