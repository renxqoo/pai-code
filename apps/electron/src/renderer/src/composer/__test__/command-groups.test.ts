import { describe, expect, test } from 'bun:test';

import { fileGroup, slashCommandGroups } from '../command-groups';
import type { CommandView } from '@paiapp/contracts';

const cmd = (name: string, source: CommandView['source'], description: string | null = null): CommandView => ({
  name,
  description,
  source,
});

describe('slashCommandGroups 斜杠命令分组', () => {
  test('三源混排：命令组在前技能组在后，条目 id 带 source 前缀，描述透传', () => {
    const groups = slashCommandGroups([cmd('goal', 'prompt', 'g'), cmd('deploy', 'extension'), cmd('skill:writer', 'skill')], {
      commandTitle: '命令',
      skillTitle: '技能',
    });
    expect(groups.map((group) => group.id)).toEqual(['commands', 'skills']);
    expect(groups[0]?.title).toBe('命令');
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['prompt:goal', 'extension:deploy']);
    expect(groups[0]?.items[0]?.description).toBe('g');
    expect(groups[1]?.title).toBe('技能');
    // 技能命令的 name 自带 skill: 前缀，id 前缀叠加只为保唯一（不对外展示）
    expect(groups[1]?.items.map((item) => item.id)).toEqual(['skill:skill:writer']);
  });

  test('只有技能命中：命令组整组丢弃（标题不出现）', () => {
    const groups = slashCommandGroups([cmd('skill:writer', 'skill')], { commandTitle: '命令', skillTitle: '技能' });
    expect(groups.map((group) => group.id)).toEqual(['skills']);
  });

  test('内置命令（builtin 源）归命令组：与模板/扩展命令同组并列', () => {
    const groups = slashCommandGroups(
      [cmd('compact', 'builtin', 'Manually compact the session context'), cmd('goal', 'prompt'), cmd('skill:writer', 'skill')],
      { commandTitle: '命令', skillTitle: '技能' },
    );
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['builtin:compact', 'prompt:goal']);
  });

  test('空目录：无组返回', () => {
    expect(slashCommandGroups([], { commandTitle: '命令', skillTitle: '技能' })).toEqual([]);
  });
});

describe('fileGroup 文件引用分组', () => {
  test('paths 映射为 @: 前缀条目；query 大小写不敏感子串收窄', () => {
    const group = fileGroup(['src/A.ts', 'README.md'], 'a.', '文件');
    expect(group.id).toBe('files');
    expect(group.title).toBe('文件');
    expect(group.items.map((item) => item.id)).toEqual(['@:src/A.ts']);
  });

  test('空 query：结果全保留', () => {
    expect(fileGroup(['a.ts', 'b.ts'], '', '文件').items).toHaveLength(2);
  });
});
