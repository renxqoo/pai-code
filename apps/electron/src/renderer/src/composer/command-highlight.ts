import type { CommandView } from '@paiapp/contracts';

/**
 * 输入框命令 token 高亮计算（纯函数，供镜像层渲染）。
 * 高亮语义锚定命令解释真相：斜杠命令由 hub 的 prompt 通路解释（/compact 等
 * 内置命令在该通路拦截）——因此只高亮消息首部、名字在命令目录（get_commands，
 * 含 builtin 源）精确命中的完整 token；未知命令与文中段斜杠文本不高亮
 * （如实呈现它们会被原样发送）。
 */

/** 高亮区间：source 保留命令分类——当前视觉统一，字段供后续按类着色/图标扩展。 */
export type HighlightRange = {
  start: number
  end: number
  source: CommandView['source']
}

/** 高亮渲染段：命中段与普通段按序拼接还原全文。 */
export type HighlightSegment = { text: string; highlighted: boolean }

export function leadingCommandHighlight(text: string, commands: readonly CommandView[]): readonly HighlightRange[] {
  if (!text.startsWith('/') || text.length === 1) return []
  const end = text.search(/\s/)
  const tokenEnd = end === -1 ? text.length : end
  if (tokenEnd === 1) return []
  const token = text.slice(1, tokenEnd)
  const hit = commands.find((command) => command.name === token)
  return hit === undefined ? [] : [{ start: 0, end: tokenEnd, source: hit.source }]
}

/** 区间切分：ranges 需升序不重叠（当前生产方只产首 token 单区间；后续多区间
 * 生产方接入时保持该约定）。越界区间经 slice 自然钳制，垃圾输入不崩溃。 */
export function splitHighlight(text: string, ranges: readonly HighlightRange[]): readonly HighlightSegment[] {
  const segments: HighlightSegment[] = []
  let at = 0
  for (const range of ranges) {
    if (range.start > at) segments.push({ text: text.slice(at, range.start), highlighted: false })
    segments.push({ text: text.slice(Math.max(range.start, at), Math.min(range.end, text.length)), highlighted: true })
    at = Math.max(at, range.end)
  }
  if (at < text.length) segments.push({ text: text.slice(at), highlighted: false })
  return segments
}

/**
 * 原子删除决策：高亮命令 token 是不可分整体——Backspace 光标紧贴 token 尾、
 * Delete（前向）光标紧贴 token 头时，一次删除整个 token；其余位置与展开选区
 * 不拦截（保留逐字符编辑与选区编辑的正常语义）。仅对「精确命中」token 生效：
 * 补全弹层打开时的部分输入不整体删除（用户正在改名字）。
 */
export function commandTokenDeleteRange(
  range: HighlightRange | undefined,
  selectionStart: number,
  selectionEnd: number,
  key: string,
): HighlightRange | null {
  if (range === undefined || selectionStart !== selectionEnd) return null
  if (key === 'Backspace') return selectionStart === range.end ? range : null
  if (key === 'Delete') return selectionStart === range.start ? range : null
  return null
}
