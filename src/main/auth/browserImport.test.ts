import { createCipheriv, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { chromeTimeToUnix, chromiumKey, decryptChromiumValue } from './browserImport'

function encrypt(plain: Buffer, password: string): Buffer {
  const cipher = createCipheriv('aes-128-cbc', chromiumKey(password), Buffer.alloc(16, ' '))
  return Buffer.concat([Buffer.from('v10'), cipher.update(plain), cipher.final()])
}

describe('chromium cookie decryption', () => {
  const key = chromiumKey('peanuts')

  it('decrypts legacy values (meta version < 24)', () => {
    const enc = encrypt(Buffer.from('abc%2C123%2Cdef'), 'peanuts')
    expect(decryptChromiumValue(enc, key, 23)).toBe('abc%2C123%2Cdef')
  })

  it('strips the 32-byte host hash for meta version >= 24', () => {
    const hash = createHash('sha256').update('.bilibili.com').digest()
    const enc = encrypt(Buffer.concat([hash, Buffer.from('SESSVALUE')]), 'peanuts')
    expect(decryptChromiumValue(enc, key, 24)).toBe('SESSVALUE')
  })

  it('passes through unencrypted values', () => {
    expect(decryptChromiumValue(Buffer.from('plain'), key, 24)).toBe('plain')
  })

  it('converts chrome time', () => {
    // 2024-01-01T00:00:00Z
    expect(chromeTimeToUnix(13348540800000000n)).toBe(1704067200)
    expect(chromeTimeToUnix(0n)).toBeUndefined()
  })
})
