import { describe, expect, test } from 'bun:test';

import { mergeCommands, parseBuiltinCommand } from '../builtin-commands';
import type { CommandView } from '@paiapp/contracts';

const hubCommand = (name: string, source: CommandView['source']): CommandView => ({ name, description: null, source });

describe('mergeCommands 内置命令合成', () => {
  test('hub 空目录：内置条目仍在（/ 触发在新会话目录就绪前也可用）', () => {
    expect(mergeCommands([])).toEqual([{ name: 'compact', description: expect.any(String), source: 'builtin' }]);
  });

  test('内置条目前置、hub 条目保序；hub 出现同名命令时内置让位（目录真相在 hub）', () => {
    const merged = mergeCommands([hubCommand('review', 'prompt'), hubCommand('skill:writer', 'skill')]);
    expect(merged.map((command) => [command.name, command.source])).toEqual([
      ['compact', 'builtin'],
      ['review', 'prompt'],
      ['skill:writer', 'skill'],
    ]);

    const yielded = mergeCommands([hubCommand('compact', 'prompt')]);
    expect(yielded.map((command) => [command.name, command.source])).toEqual([['compact', 'prompt']]);
  });

  test('清单 name 不带前导斜杠（与 hub 目录约定一致，补全/高亮按首 token 匹配）', () => {
    for (const command of mergeCommands([])) {
      if (command.source === 'builtin') expect(command.name.startsWith('/')).toBe(false);
    }
  });
});

describe('parseBuiltinCommand 提交拦截词法', () => {
  test.each([
    ['/compact', { name: 'compact', rest: '' }],
    ['/compact 保留迁移重点', { name: 'compact', rest: '保留迁移重点' }],
    ['/compact  首尾空白收敛、内部空白原样保留  ', { name: 'compact', rest: '首尾空白收敛、内部空白原样保留' }],
    ['/compact\n换行后的指示也收进来', { name: 'compact', rest: '换行后的指示也收进来' }],
  ])('命中：%s', (text, expected) => {
    expect(parseBuiltinCommand(text)).toEqual(expected);
  });

  test.each([
    ['/compactfoo', '/compactfoo 不是命令（首 token 不精确匹配），照常作为消息发送'],
    ['/compact-x', '连字符延伸名不劫持'],
    ['/COMPACT', '大小写敏感'],
    ['看这个 /compact', '非行首斜杠不拦截'],
    ['  /compact', '前导空白不命中——与命令高亮及 pi 的 startsWith("/") 解释词法一致'],
    ['/skill:writer', '非内置命令不命中（走 hub 解释）'],
  ])('不命中：%s（%s）', (text) => {
    expect(parseBuiltinCommand(text)).toBeNull();
  });
});
