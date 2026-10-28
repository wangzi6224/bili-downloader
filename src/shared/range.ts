/** “1-5, 7, 9-12” → 序号集合；单段最多展开 10000 个，防止误输入卡死 */
export function parseRange(text: string): Set<number> {
  const out = new Set<number>()
  for (const part of text.split(/[,，\s]+/)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    const lo = Math.min(a, b)
    for (let i = lo; i <= Math.max(a, b) && i - lo < 10000; i++) out.add(i)
  }
  return out
}
