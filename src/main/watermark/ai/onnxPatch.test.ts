import { describe, expect, it } from 'vitest'
import { fixInputShape, inputShapes, lenField, readFields, varint } from './onnxPatch'

// 按 ONNX 的 protobuf 结构拼一个小模型：只有用到的字段
const str = (no: number, s: string): Buffer[] => lenField(no, [Buffer.from(s)])
const msg = (no: number, parts: Buffer[]): Buffer[] => lenField(no, parts)
const vint = (no: number, v: number): Buffer[] => [varint(no * 8), varint(v)]
const dim = (d: number | string): Buffer[] => msg(1, typeof d === 'number' ? vint(1, d) : str(2, d))
const valueInfo = (no: number, name: string, dims: (number | string)[]): Buffer[] =>
  msg(no, [...str(1, name), ...msg(2, msg(1, [...vint(1, 1), ...msg(2, dims.flatMap(dim))]))])

function model(graph: Buffer[]): Buffer {
  return Buffer.concat([...vint(1, 8), ...str(2, 'pytorch'), ...msg(7, graph), ...msg(8, [...str(1, ''), ...vint(2, 17)])])
}

const GRAPH = [
  ...msg(1, [...str(1, 'Conv'), ...str(4, 'Conv')]),
  ...str(2, 'main'),
  ...msg(5, [...vint(1, 3), ...str(8, 'w'), Buffer.from([0x4a, 0x04, 1, 2, 3, 4])]),
  ...valueInfo(11, 'image', ['batch', 3, 512, 512]),
  ...valueInfo(11, 'mask', ['batch', 1, 512, 512]),
  ...valueInfo(11, 'scale', [1]),
  ...valueInfo(12, 'output', ['batch', 3, 'H', 'W']),
  ...valueInfo(13, 'tmp', [1, 64, 256, 256])
]

describe('protobuf 读写', () => {
  it('varint 来回一致，包括超过 32 位的数', () => {
    for (const v of [0, 1, 127, 128, 300, 2 ** 31, 2 ** 40 + 5]) {
      const b = varint(v)
      const f = readFields(Buffer.concat([varint(8), b]))
      expect(f[0].value).toBe(v)
    }
  })

  it('读出各种类型的字段', () => {
    const buf = Buffer.concat([...vint(1, 5), ...str(2, 'ab'), varint(3 * 8 + 1), Buffer.alloc(8), varint(4 * 8 + 5), Buffer.alloc(4)])
    expect(readFields(buf).map((f) => [f.no, f.wire])).toEqual([
      [1, 0],
      [2, 2],
      [3, 1],
      [4, 5]
    ])
  })

  it('截断或格式不对时报错', () => {
    expect(() => readFields(Buffer.from([0x12, 0x05, 1]))).toThrow('不完整')
    expect(() => readFields(Buffer.from([0x19, 1, 2]))).toThrow('不完整')
    expect(() => readFields(Buffer.from([0x1d, 1]))).toThrow('不完整')
    expect(() => readFields(Buffer.from([0x0b]))).toThrow('格式不对')
    expect(() => readFields(Buffer.from([0x08]))).toThrow('不完整')
    expect(() => readFields(Buffer.from([0x08, ...Array(10).fill(0xff)]))).toThrow('格式不对')
  })
})

describe('fixInputShape', () => {
  const src = model(GRAPH)

  it('把四维的输入输出改成固定尺寸，其他输入不动', () => {
    const out = fixInputShape(src, { batch: 1, height: 144, width: 432 })
    expect(inputShapes(out)).toEqual([
      { name: 'image', dims: [1, 3, 144, 432] },
      { name: 'mask', dims: [1, 1, 144, 432] },
      { name: 'scale', dims: [1] },
      { name: 'output', dims: [1, 3, 144, 432] }
    ])
    expect(inputShapes(src)[0].dims).toEqual([undefined, 3, 512, 512])
  })

  it('去掉中间结果的形状记录，节点、权重、版本号原样保留', () => {
    const out = fixInputShape(src, { batch: 1, height: 64, width: 64 })
    const graph = readFields(out).find((f) => f.no === 7)!
    const fields = readFields(out, graph.vStart, graph.vEnd)
    expect(fields.some((f) => f.no === 13)).toBe(false)
    const orig = readFields(src, readFields(src).find((f) => f.no === 7)!.vStart)
    for (const no of [1, 2, 5]) {
      const a = orig.find((f) => f.no === no)!
      const b = fields.find((f) => f.no === no)!
      expect(Buffer.compare(src.subarray(a.start, a.end), out.subarray(b.start, b.end))).toBe(0)
    }
    expect(readFields(out).filter((f) => f.no !== 7).map((f) => f.no)).toEqual([1, 2, 8])
  })

  it('尺寸无效、没有计算图、没有图像输入时报错', () => {
    expect(() => fixInputShape(src, { batch: 1, height: 0, width: 16 })).toThrow('尺寸无效')
    expect(() => fixInputShape(src, { batch: 1, height: 1.5, width: 16 })).toThrow('尺寸无效')
    expect(() => fixInputShape(Buffer.concat(vint(1, 8)), { batch: 1, height: 16, width: 16 })).toThrow('没有计算图')
    expect(() => fixInputShape(model(valueInfo(11, 'x', [1, 4])), { batch: 1, height: 16, width: 16 })).toThrow('不是图像')
  })

  it('没有计算图时 inputShapes 返回空', () => {
    expect(inputShapes(Buffer.concat(vint(1, 8)))).toEqual([])
  })

  it('不是张量的输入（没有形状）不改', () => {
    const noShape = msg(11, [...str(1, 'seq'), ...msg(2, msg(4, vint(1, 1)))])
    const out = fixInputShape(model([...noShape, ...valueInfo(11, 'image', [1, 3, 8, 8])]), { batch: 1, height: 16, width: 32 })
    expect(inputShapes(out)).toEqual([
      { name: 'seq', dims: [] },
      { name: 'image', dims: [1, 3, 16, 32] }
    ])
  })
})
