import { describe, expect, it } from 'vitest'
import { encodeIco } from './ico.mjs'

describe('encodeIco', () => {
  it('writes PNG payloads as a multi-size Windows icon and encodes 256 as zero', () => {
    const icons = [
      { size: 16, data: Buffer.from('png16') },
      { size: 256, data: Buffer.from('png256') }
    ]
    const ico = encodeIco(icons)
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    expect([ico[6], ico[22]]).toEqual([16, 0])
    for (const [i, icon] of icons.entries()) {
      const entry = 6 + i * 16
      const length = ico.readUInt32LE(entry + 8)
      const offset = ico.readUInt32LE(entry + 12)
      expect(length).toBe(icon.data.length)
      expect(ico.subarray(offset, offset + length)).toEqual(icon.data)
    }
  })

  it('rejects an empty icon set', () => {
    expect(() => encodeIco([])).toThrow('ICO 至少需要一个尺寸')
  })
})
