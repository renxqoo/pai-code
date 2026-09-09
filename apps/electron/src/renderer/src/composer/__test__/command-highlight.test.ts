import { describe, expect, test } from 'bun:test';

import { commandTokenDeleteRange, leadingCommandHighlight, splitHighlight } from '../command-highlight';
import { mergeCommands } from '../builtin-commands';
import type { CommandView } from '@paiapp/contracts';

const SKILL: CommandView = { name: 'skill:writer', description: null, source: 'skill' };

describe('leadingCommandHighlight', () => {
  test('首部技能命令命中：区间覆盖 /skill 名 token，附加指令不进区间', () => {
    expect(leadingCommandHighlight('/skill:writer 写一段', [SKILL])).toEqual([{ start: 0, end: 13, source: 'skill' }])
  })

  test('无尾随参数：区间覆盖至串尾', () => {
    expect(leadingCommandHighlight('/skill:writer', [SKILL])).toEqual([{ start: 0, end: 13, source: 'skill' }])
  })

  test('其他命令源同样命中（扩展/模板命令：子代理、压缩等新命令入目录即生效）', () => {
    expect(leadingCommandHighlight('/compact', [{ name: 'compact', description: null, source: 'extension' }])).toEqual([
      { start: 0, end: 8, source: 'extension' },
    ])
    expect(leadingCommandHighlight('/review 尽快', [{ name: 'review', description: null, source: 'prompt' }])).toEqual([
      { start: 0, end: 7, source: 'prompt' },
    ])
    // 内置命令（builtin 源）同一词法命中：附加指示文本不进高亮区间
    const builtinCompact = mergeCommands([]).find((command) => command.source === 'builtin');
    expect(builtinCompact).toBeDefined();
    expect(leadingCommandHighlight('/compact 保留重点', builtinCompact === undefined ? [] : [builtinCompact])).toEqual([
      { start: 0, end: 8, source: 'builtin' },
    ])
  })

  test('目录未收录的名字不高亮（如实呈现：会被原样发送）', () => {
    expect(leadingCommandHighlight('/skill:unknown', [SKILL])).toEqual([])
    expect(leadingCommandHighlight('/skill:wri', [SKILL])).toEqual([])
  })

  test('非首部斜杠不高亮：pi 仅解释 startsWith("/") 的提示词', () => {
    expect(leadingCommandHighlight('看这个 /skill:writer', [SKILL])).toEqual([])
    expect(leadingCommandHighlight('普通消息', [SKILL])).toEqual([])
  })

  test('裸 "/" 与 "/ 空格" 不是命令 token', () => {
    expect(leadingCommandHighlight('/', [SKILL])).toEqual([])
    expect(leadingCommandHighlight('/ 写一段', [SKILL])).toEqual([])
  })
})

describe('splitHighlight', () => {
  test('单命中区间切三段：前普通 / 命中 / 尾普通', () => {
    expect(splitHighlight('/skill:writer 写一段', [{ start: 0, end: 13, source: 'skill' }])).toEqual([
      { text: '/skill:writer', highlighted: true },
      { text: ' 写一段', highlighted: false },
    ])
  })

  test('中段区间（供后续多区间生产方复用）', () => {
    expect(splitHighlight('abcXYz', [{ start: 3, end: 5, source: 'skill' }])).toEqual([
      { text: 'abc', highlighted: false },
      { text: 'XY', highlighted: true },
      { text: 'z', highlighted: false },
    ])
  })

  test('空区间列表返回整段普通文本', () => {
    expect(splitHighlight('全文', [])).toEqual([{ text: '全文', highlighted: false }])
  })

  test('越界区间经 slice 钳制，垃圾输入不崩溃', () => {
    expect(splitHighlight('ab', [{ start: 0, end: 99, source: 'skill' }])).toEqual([{ text: 'ab', highlighted: true }])
  })
})

describe('commandTokenDeleteRange', () => {
  const RANGE = { start: 0, end: 13, source: 'skill' as const };

  test('Backspace 光标紧贴 token 尾：整体删除', () => {
    expect(commandTokenDeleteRange(RANGE, 13, 13, 'Backspace')).toEqual(RANGE)
  })

  test('Delete（前向）光标紧贴 token 头：整体删除', () => {
    expect(commandTokenDeleteRange(RANGE, 0, 0, 'Delete')).toEqual(RANGE)
  })

  test('token 内部/越界位置不拦截：保留逐字符编辑语义', () => {
    expect(commandTokenDeleteRange(RANGE, 12, 12, 'Backspace')).toBeNull()
    expect(commandTokenDeleteRange(RANGE, 0, 0, 'Backspace')).toBeNull()
    expect(commandTokenDeleteRange(RANGE, 5, 5, 'Delete')).toBeNull()
    expect(commandTokenDeleteRange(RANGE, 13, 13, 'Delete')).toBeNull()
  })

  test('有展开选区时不拦截（用户显式选择的删除走原生语义）', () => {
    expect(commandTokenDeleteRange(RANGE, 3, 8, 'Backspace')).toBeNull()
  })

  test('无命中 token 或其他按键返回 null', () => {
    expect(commandTokenDeleteRange(undefined, 13, 13, 'Backspace')).toBeNull()
    expect(commandTokenDeleteRange(RANGE, 13, 13, 'Enter')).toBeNull()
  })
})
