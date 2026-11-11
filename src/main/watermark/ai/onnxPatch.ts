// 把 ONNX 模型的输入输出改成固定尺寸。
// LaMa 是全卷积的，换个输入尺寸照样能跑，但只有尺寸写死在模型里，onnxruntime 才能在加载时把
// 几千个形状计算折叠成常量（实测比动态尺寸快 50%）；Node 版不支持 freeDimensionOverrides，只能改模型。
// 只解析用得到的几层 protobuf，权重等其他字段原样复制

import { t } from '@shared/i18n'

/** 一个字段在 buf 里的位置：[start, end) 是整个字段，[vStart, vEnd) 是长度类型字段的内容 */
export interface Field {
  no: number
  wire: number
  start: number
  end: number
  vStart: number
  vEnd: number
  /** varint 字段的值 */
  value?: number
}

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let v = 0
  let mul = 1
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new Error(t('wm.modelIncomplete'))
    const b = buf[pos++]
    v += (b & 0x7f) * mul
    if (b < 0x80) return [v, pos]
    mul *= 128
  }
  throw new Error(t('wm.modelBadFormat'))
}

/** 逐个读出 buf[from, to) 里的字段 */
export function readFields(buf: Uint8Array, from = 0, to = buf.length): Field[] {
  const out: Field[] = []
  let pos = from
  while (pos < to) {
    const start = pos
    const [key, p] = readVarint(buf, pos)
    pos = p
    const no = Math.floor(key / 8)
    const wire = key % 8
    if (wire === 0) {
      const [value, q] = readVarint(buf, pos)
      out.push({ no, wire, start, end: q, vStart: pos, vEnd: q, value })
      pos = q
    } else if (wire === 2) {
      const [len, q] = readVarint(buf, pos)
      const end = q + len
      if (end > to) throw new Error(t('wm.modelIncomplete'))
      out.push({ no, wire, start, end, vStart: q, vEnd: end })
      pos = end
    } else if (wire === 1 || wire === 5) {
      const end = pos + (wire === 1 ? 8 : 4)
      if (end > to) throw new Error(t('wm.modelIncomplete'))
      out.push({ no, wire, start, end, vStart: pos, vEnd: end })
      pos = end
    } else {
      throw new Error(t('wm.modelBadFormat'))
    }
  }
  return out
}

export function varint(v: number): Buffer {
  const bytes: number[] = []
  do {
    let b = v % 128
    v = Math.floor(v / 128)
    if (v > 0) b |= 0x80
    bytes.push(b)
  } while (v > 0)
  return Buffer.from(bytes)
}

/** 长度类型的字段：键 + 长度 + 内容 */
export function lenField(no: number, parts: Uint8Array[]): Buffer[] {
  const len = parts.reduce((a, p) => a + p.length, 0)
  return [varint(no * 8 + 2), varint(len), ...parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.length))]
}

const total = (parts: Uint8Array[]): number => parts.reduce((a, p) => a + p.length, 0)

// ModelProto.graph = 7；GraphProto.input = 11、output = 12、value_info = 13；
// ValueInfoProto.type = 2；TypeProto.tensor_type = 1；Tensor.shape = 2；Shape.dim = 1；Dimension.dim_value = 1
const MODEL_GRAPH = 7
const GRAPH_INPUT = 11
const GRAPH_OUTPUT = 12
const GRAPH_VALUE_INFO = 13

/** 有几个维度；不是张量时为 0 */
function dims(buf: Uint8Array, vi: Field): Field[] {
  const type = readFields(buf, vi.vStart, vi.vEnd).find((f) => f.no === 2 && f.wire === 2)
  const tensor = type && readFields(buf, type.vStart, type.vEnd).find((f) => f.no === 1 && f.wire === 2)
  const shape = tensor && readFields(buf, tensor.vStart, tensor.vEnd).find((f) => f.no === 2 && f.wire === 2)
  return shape ? readFields(buf, shape.vStart, shape.vEnd).filter((f) => f.no === 1 && f.wire === 2) : []
}

/** 读一个维度的值；是符号（batch、H）时为 undefined */
function dimValue(buf: Uint8Array, d: Field): number | undefined {
  return readFields(buf, d.vStart, d.vEnd).find((f) => f.no === 1 && f.wire === 0)?.value
}

/** 按 sizes 重写一个 ValueInfoProto 里的形状；sizes 里 undefined 的维度保持原样 */
function rewriteValueInfo(buf: Uint8Array, vi: Field, sizes: (number | undefined)[]): Uint8Array[] {
  const rebuild = (f: Field, depth: number): Uint8Array[] => {
    const parts: Uint8Array[] = []
    let dimIndex = 0
    for (const c of readFields(buf, f.vStart, f.vEnd)) {
      const path = depth === 0 ? c.no === 2 : depth === 1 ? c.no === 1 : depth === 2 ? c.no === 2 : c.no === 1
      if (c.wire !== 2 || !path) {
        parts.push(buf.subarray(c.start, c.end))
      } else if (depth < 3) {
        parts.push(...lenField(c.no, rebuild(c, depth + 1)))
      } else {
        const size = sizes[dimIndex++]
        parts.push(...(size === undefined ? [buf.subarray(c.start, c.end)] : lenField(1, [varint(8), varint(size)])))
      }
    }
    return parts
  }
  return lenField(vi.no, rebuild(vi, 0))
}

export interface FixedShape {
  /** 输入输出里四维张量的批量、高、宽；通道数保持不变 */
  batch: number
  height: number
  width: number
}

/**
 * 把模型里所有四维的输入输出（N, C, H, W）改成固定的 batch、height、width，
 * 并去掉中间结果的形状记录（原尺寸下推出来的，留着会和新尺寸冲突）。返回新的模型字节
 */
export function fixInputShape(model: Uint8Array, s: FixedShape): Buffer {
  for (const v of [s.batch, s.height, s.width]) {
    if (!Number.isInteger(v) || v < 1) throw new Error(t('wm.modelBadSize'))
  }
  const top = readFields(model)
  const graph = top.find((f) => f.no === MODEL_GRAPH && f.wire === 2)
  if (!graph) throw new Error(t('wm.modelNoGraph'))
  let patched = 0
  const graphParts: Uint8Array[] = []
  for (const f of readFields(model, graph.vStart, graph.vEnd)) {
    if (f.no === GRAPH_VALUE_INFO) continue
    if ((f.no === GRAPH_INPUT || f.no === GRAPH_OUTPUT) && f.wire === 2 && dims(model, f).length === 4) {
      graphParts.push(...rewriteValueInfo(model, f, [s.batch, undefined, s.height, s.width]))
      patched++
    } else {
      graphParts.push(model.subarray(f.start, f.end))
    }
  }
  if (!patched) throw new Error(t('wm.modelInputNotImage'))
  const parts: Uint8Array[] = []
  for (const f of top) {
    parts.push(...(f === graph ? lenField(MODEL_GRAPH, graphParts) : [model.subarray(f.start, f.end)]))
  }
  return Buffer.concat(parts, total(parts))
}

/** 读出模型里四维输入输出的形状（符号维度为 undefined），校验和测试用 */
export function inputShapes(model: Uint8Array): { name: string; dims: (number | undefined)[] }[] {
  const graph = readFields(model).find((f) => f.no === MODEL_GRAPH && f.wire === 2)
  if (!graph) return []
  return readFields(model, graph.vStart, graph.vEnd)
    .filter((f) => (f.no === GRAPH_INPUT || f.no === GRAPH_OUTPUT) && f.wire === 2)
    .map((f) => {
      const nameField = readFields(model, f.vStart, f.vEnd).find((c) => c.no === 1 && c.wire === 2)
      const name = nameField ? Buffer.from(model.subarray(nameField.vStart, nameField.vEnd)).toString('utf8') : ''
      return { name, dims: dims(model, f).map((d) => dimValue(model, d)) }
    })
}
