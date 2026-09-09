import { describe, expect, test } from 'bun:test';

import { parseSkillInvocation, toSkillInvocationInput } from '../skill-invocation';

/** 与 pi 展开产物同形的构造器（两种产源：正文 trim / 正文原样）。 */
function block(name: string, location: string, dir: string, body: string, instructions?: string): string {
  const skillBlock = `<skill name="${name}" location="${location}">\nReferences are relative to ${dir}.\n\n${body}\n</skill>`
  return instructions === undefined ? skillBlock : `${skillBlock}\n\n${instructions}`
}

describe('parseSkillInvocation', () => {
  test('标准展开块：pi-coding-agent 变体（正文已 trim），无附加指令', () => {
    const parsed = parseSkillInvocation(block('writer', '/Users/x/skills/writer/SKILL.md', '/Users/x/skills/writer', '# 写手\n正文。'))
    expect(parsed).toEqual({
      name: 'writer',
      location: '/Users/x/skills/writer/SKILL.md',
      body: '# 写手\n正文。',
      instructions: '',
    })
  })

  test('pi-agent-core 变体：正文带尾换行也原样归属 body', () => {
    const parsed = parseSkillInvocation(block('pdf', '/opt/s/pdf/SKILL.md', '/opt/s/pdf', '内容\n\n'))
    expect(parsed?.body).toBe('内容\n\n')
  })

  test('带附加指令：拖尾归属 instructions（多行、含空格路径与连字符技能名）', () => {
    const parsed = parseSkillInvocation(
      block('repo-migration-e2e-v2', '/Users/w/.agents/skills/repo-migration-e2e-v2/SKILL.md', '/Users/w/.agents/skills/repo-migration-e2e-v2', '方法论', '迁移 A 仓库\n分两阶段'),
    )
    expect(parsed?.name).toBe('repo-migration-e2e-v2')
    expect(parsed?.body).toBe('方法论')
    expect(parsed?.instructions).toBe('迁移 A 仓库\n分两阶段')
  })

  test('正文含 </skill> 字面量：闭合取真标签，字面量留在 body', () => {
    const parsed = parseSkillInvocation(block('a', '/s/a/SKILL.md', '/s/a', '前段\n</skill>\n后段'))
    expect(parsed?.body).toBe('前段\n</skill>\n后段')
    expect(parsed?.instructions).toBe('')
  })

  test('正文与附加指令都含 </skill> 字面量：各自归属不串', () => {
    const parsed = parseSkillInvocation(block('a', '/s/a/SKILL.md', '/s/a', '前段\n</skill>\n后段', '指\n</skill>\n令'))
    expect(parsed?.body).toBe('前段\n</skill>\n后段')
    expect(parsed?.instructions).toBe('指\n</skill>\n令')
  })

  test('空白附加指令拖尾归一为空串', () => {
    const parsed = parseSkillInvocation(`${block('a', '/s/a/SKILL.md', '/s/a', '正文')}\n\n   `)
    expect(parsed?.instructions).toBe('')
  })

  test('空正文可解析（body 为空串）', () => {
    const parsed = parseSkillInvocation(block('a', '/s/a/SKILL.md', '/s/a', ''))
    expect(parsed?.body).toBe('')
  })

  test('非技能文本 / 普通用户输入返回 null', () => {
    expect(parseSkillInvocation('普通消息')).toBeNull()
    expect(parseSkillInvocation('/skill:writer 直接输入形式（未经展开）')).toBeNull()
  })

  test('畸形形状降级：前缀不符 / 缺属性 / 缺 References 行 / 无闭合标签', () => {
    expect(parseSkillInvocation('<skill name=x location="/s">…')).toBeNull()
    expect(parseSkillInvocation('<skill name="" location="/s/a/SKILL.md">\nReferences are relative to /s/a.\n\nx\n</skill>')).toBeNull()
    expect(parseSkillInvocation('<skill name="a" location="/s/a/SKILL.md">\n不是引用行\n\nx\n</skill>')).toBeNull()
    expect(parseSkillInvocation('<skill name="a" location="/s/a/SKILL.md">\nReferences are relative to /s/a.\n\n正文被截断')).toBeNull()
  })

  test('References 行缺句号终止符判为畸形', () => {
    expect(parseSkillInvocation('<skill name="a" location="/s/a/SKILL.md">\nReferences are relative to /s/a\n\nx\n</skill>')).toBeNull()
  })
})

describe('toSkillInvocationInput', () => {
  test('无附加指令回填裸命令', () => {
    const parsed = parseSkillInvocation(block('writer', '/s/writer/SKILL.md', '/s/writer', '正文'))
    expect(parsed !== null && toSkillInvocationInput(parsed)).toBe('/skill:writer')
  })

  test('有附加指令回填命令 + 单空格 + 指令（pi 按首个空格切分，重展开等价）', () => {
    const parsed = parseSkillInvocation(block('writer', '/s/writer/SKILL.md', '/s/writer', '正文', '写一段 介绍'))
    expect(parsed !== null && toSkillInvocationInput(parsed)).toBe('/skill:writer 写一段 介绍')
  })
})
