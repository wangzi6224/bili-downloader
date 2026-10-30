import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: m.spawn }))

const { unprotect } = await import('./dpapi')

class FakeChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
}

describe('Windows DPAPI', () => {
  it('sends only base64 ciphertext over stdin and returns the unprotected bytes', async () => {
    const encrypted = Buffer.from('encrypted key')
    const plain = Buffer.from('AES key')
    const child = new FakeChild()
    let input = ''
    child.stdin.on('data', (chunk: Buffer) => (input += chunk.toString('utf8')))
    m.spawn.mockImplementation(() => {
      queueMicrotask(() => {
        child.stdout.end(plain.toString('base64'))
        child.emit('close', 0, null)
      })
      return child
    })

    await expect(unprotect(encrypted)).resolves.toEqual(plain)
    expect(m.spawn).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    expect(m.spawn.mock.calls[0][1][3]).not.toContain(encrypted.toString('base64'))
    expect(input).toBe(encrypted.toString('base64'))
  })

  it('rejects when Windows cannot decrypt the value', async () => {
    const child = new FakeChild()
    m.spawn.mockImplementation(() => {
      queueMicrotask(() => {
        child.stderr.end('DPAPI denied')
        child.emit('close', 1, null)
      })
      return child
    })
    await expect(unprotect(Buffer.from('encrypted'))).rejects.toThrow('DPAPI 解密失败：DPAPI denied')
  })
})
