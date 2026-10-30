import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POWERSHELL } from '../powershell'

const m = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: m.spawn }))

const { unprotect } = await import('./dpapi')

class FakeChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
}

/**
 * 假的 PowerShell：收下 stdin，然后按给定的输出结束。
 * 每次调用都新建一个：Vitest 自己也会调 spawn，同样会拿到这里的假进程
 */
function fakePowerShell(out: { stdout?: string; stderr?: string; code?: number | null; signal?: string }): { input: () => string } {
  let input = ''
  m.spawn.mockImplementation(() => {
    const child = new FakeChild()
    child.stdin.on('data', (chunk: Buffer) => (input += chunk.toString('utf8')))
    queueMicrotask(() => {
      child.stdout.end(out.stdout ?? '')
      child.stderr.end(out.stderr ?? '')
      child.emit('close', out.code ?? 0, out.signal ?? null)
    })
    return child
  })
  return { input: () => input }
}

describe('Windows DPAPI', () => {
  beforeEach(() => m.spawn.mockReset())

  it('只通过 stdin 传 base64 密文，一个进程按顺序解完多条', async () => {
    const encrypted = [Buffer.from('encrypted key'), Buffer.from('legacy cookie')]
    const plain = [Buffer.from('AES key'), Buffer.from('cookie value')]
    const ps = fakePowerShell({ stdout: plain.map((p) => `${p.toString('base64')}\r\n`).join('') })

    await expect(unprotect(encrypted)).resolves.toEqual(plain)
    expect(m.spawn).toHaveBeenCalledTimes(1)
    expect(m.spawn).toHaveBeenCalledWith(POWERSHELL, ['-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)], {
      windowsHide: true,
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    expect(m.spawn.mock.calls[0][1][3]).not.toContain(encrypted[0].toString('base64'))
    expect(ps.input()).toBe(encrypted.map((e) => e.toString('base64')).join('\n'))
  })

  it('没有要解密的就不启动 PowerShell', async () => {
    await expect(unprotect([])).resolves.toEqual([])
    expect(m.spawn).not.toHaveBeenCalled()
  })

  it('Windows 解不开时报错', async () => {
    fakePowerShell({ stderr: 'DPAPI denied', code: 1 })
    await expect(unprotect([Buffer.from('encrypted')])).rejects.toThrow('DPAPI 解密失败：DPAPI denied')
  })

  it('超时被结束时报超时', async () => {
    fakePowerShell({ code: null, signal: 'SIGTERM' })
    await expect(unprotect([Buffer.from('encrypted')])).rejects.toThrow('DPAPI 解密超时')
  })

  it('返回的条数不对时报错，不拿错位的结果', async () => {
    fakePowerShell({ stdout: `${Buffer.from('only one').toString('base64')}\r\n` })
    await expect(unprotect([Buffer.from('a'), Buffer.from('b')])).rejects.toThrow('PowerShell 没有返回完整的解密结果')
  })
})
