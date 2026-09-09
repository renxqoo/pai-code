/**
 * pi 技能展开块（hub 把 `/skill:<name> [附加指令]` 提示词展开后的用户消息文本）：
 * `<skill name="N" location="P">\nReferences are relative to D.\n\n<正文>\n</skill>`，
 * 可选拖尾 `\n\n<附加指令>`。两种产源同形：pi-coding-agent `_expandSkillCommand`
 * （正文 trim）与 pi-agent-core `formatSkillInvocation`（正文原样，可带尾换行）。
 * 会话真相仍是全量块；本模块只服务展示层紧凑化与编辑回填重构，
 * 形状不符一律返回 null（调用方按普通文本原样降级）。
 */

export type SkillInvocation = {
  /** 技能名（slug，如 repo-migration-e2e-v2） */
  readonly name: string
  /** SKILL.md 文件路径（pi 写入 location 属性） */
  readonly location: string
  /** SKILL.md 正文（frontmatter 已由 pi 剥离） */
  readonly body: string
  /** 技能名后附加的用户指令；无则空串 */
  readonly instructions: string
}

const OPEN_NAME = '<skill name="'
const LOCATION_INFIX = '" location="'
const REFS_PREFIX = '">\nReferences are relative to '
const REFS_LINE_SUFFIX = '.'
const PARAGRAPH_BREAK = '\n\n'
const CLOSE_TAG = '\n</skill>'

export function parseSkillInvocation(text: string): SkillInvocation | null {
  if (!text.startsWith(OPEN_NAME)) return null
  const nameEnd = text.indexOf(LOCATION_INFIX, OPEN_NAME.length)
  if (nameEnd === -1) return null
  const name = text.slice(OPEN_NAME.length, nameEnd)
  if (name.length === 0) return null
  const locationStart = nameEnd + LOCATION_INFIX.length
  const refsStart = text.indexOf(REFS_PREFIX, locationStart)
  if (refsStart === -1) return null
  const location = text.slice(locationStart, refsStart)
  if (location.length === 0) return null
  const bodyStart = text.indexOf(PARAGRAPH_BREAK, refsStart + REFS_PREFIX.length)
  if (bodyStart === -1) return null
  const refsLine = text.slice(refsStart + REFS_PREFIX.length, bodyStart)
  if (!refsLine.endsWith(REFS_LINE_SUFFIX)) return null
  const bodyOffset = bodyStart + PARAGRAPH_BREAK.length
  // 闭合标签从尾部向前找：正文与附加指令都可能含 `\n</skill>` 字面量，
  // 只有其后为串尾（无附加指令）或紧跟 `\n\n`（附加指令分隔）的才是真闭合
  for (let closeAt = text.lastIndexOf(CLOSE_TAG); closeAt >= bodyOffset; closeAt = text.lastIndexOf(CLOSE_TAG, closeAt - 1)) {
    const trailing = text.slice(closeAt + CLOSE_TAG.length)
    const body = text.slice(bodyOffset, closeAt)
    if (trailing.length === 0) return { name, location, body, instructions: '' }
    if (trailing.startsWith(PARAGRAPH_BREAK)) {
      return { name, location, body, instructions: trailing.slice(PARAGRAPH_BREAK.length).trim() }
    }
  }
  return null
}

/** 编辑/重试回填：展开块重构为等价输入形式（pi 收到后会再次展开，语义不变）。 */
export function toSkillInvocationInput(invocation: SkillInvocation): string {
  const suffix = invocation.instructions.length > 0 ? ` ${invocation.instructions}` : ''
  return `/skill:${invocation.name}${suffix}`
}
