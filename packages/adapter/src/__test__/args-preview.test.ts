import { describe, expect, test } from 'bun:test';

import { previewArgs } from '../args-preview';

describe('previewArgs · 字段优先级与防御', () => {
  test.each([
    ['命令本体优先（command）', { command: 'git status' }, 'git status'],
    ['cmd 别名', { cmd: 'ls -la' }, 'ls -la'],
    ['路径次之（path）', { path: 'src/a.ts' }, 'src/a.ts'],
    ['file_path 兼容', { file_path: 'x.ts', n: 1 }, 'x.ts'],
    ['pattern', { pattern: 'TODO' }, 'TODO'],
    ['query', { query: '如何' }, '如何'],
    ['url', { url: 'https://x.dev' }, 'https://x.dev'],
    ['name', { name: 'explore' }, 'explore'],
    ['subagent_type', { subagent_type: 'general-purpose' }, 'general-purpose'],
    ['无已知字段取首项字符串值', { z: 'first', y: 2 }, 'first'],
    ['首项非字符串走浅层 JSON', { z: { a: 1, b: [1, 2] } }, '{"a":1,"b":[1,2]}'],
    ['空参数', {}, ''],
  ])('%s', (_name, args, expected) => {
    expect(previewArgs(args as Record<string, unknown>)).toBe(expected);
  });

  test('多行与超长压缩为单行并截断到 160', () => {
    expect(previewArgs({ command: 'echo a\n  b\tc' })).toBe('echo a b c');
    const long = previewArgs({ command: 'x'.repeat(300) });
    expect(long.length).toBe(160);
    expect(long.endsWith('…')).toBe(true);
  });
});
