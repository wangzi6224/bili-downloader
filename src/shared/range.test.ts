import { describe, expect, it } from 'vitest'
import { parseRange } from './range'

describe('parseRange', () => {
  it('parses ranges and single numbers', () => {
    expect([...parseRange('1-3, 7，9-10')]).toEqual([1, 2, 3, 7, 9, 10])
  })

  it('accepts reversed ranges and ignores junk', () => {
    expect([...parseRange('5-3 x 8-')]).toEqual([3, 4, 5])
  })

  it('caps huge ranges', () => {
    expect(parseRange('1-99999999').size).toBe(10000)
  })
})
