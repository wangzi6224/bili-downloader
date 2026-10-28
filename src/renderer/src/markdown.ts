// 更新说明只用到标题、列表和段落，不引入完整的 Markdown 库

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string }

export type Block =
  | { type: 'heading'; content: InlineNode[] }
  | { type: 'paragraph'; content: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }

/** 行内：**粗体**、`代码`、[文字](https://链接) */
export function inline(text: string): InlineNode[] {
  const out: InlineNode[] = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[1]) out.push({ type: 'strong', text: m[1] })
    else if (m[2]) out.push({ type: 'code', text: m[2] })
    else out.push({ type: 'link', text: m[3], href: m[4] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flush = (): void => {
    if (para.length) blocks.push({ type: 'paragraph', content: inline(para.join(' ')) })
    para = []
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(inline) })
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    const item = /^(?:[-*+]|(\d+)\.)\s+(.*)$/.exec(line)
    if (!line) flush()
    else if (heading) {
      flush()
      blocks.push({ type: 'heading', content: inline(heading[1]) })
    } else if (item) {
      if (para.length || (list && list.ordered !== Boolean(item[1]))) flush()
      list ??= { ordered: Boolean(item[1]), items: [] }
      list.items.push(item[2])
    } else if (list && /^\s{2,}/.test(raw)) {
      // 缩进的续行接在上一条后面
      list.items[list.items.length - 1] += ` ${line}`
    } else {
      if (list) flush()
      para.push(line)
    }
  }
  flush()
  return blocks
}

/** 发布日期显示成本地格式，解析不了的原样返回 */
export const fmtDate = (s: string): string => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('zh-CN')
}
