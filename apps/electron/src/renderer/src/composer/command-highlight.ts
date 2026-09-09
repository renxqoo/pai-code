import type { CommandView } from '@paiapp/contracts';

/**
 * 输入框命令 token 高亮计算（纯函数，供镜像层渲染）。
 * 高亮语义锚定 pi 的命令解释真相：模板（expandPromptTemplate）、技能
 * （_expandSkillCommand）、扩展命令都以「提示词以 / 开头 + 首 token 与
 * 命令名精确匹配」为命中条件——因此只高亮消息首部、名字在命令目录
 * （get_commands）精确命中的完整 token；未知命令与文中段斜杠文本不高亮
 * （如实呈现它们会被原样发送）。新命令种类（子代理、压缩等）入目录即自动生效。
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
