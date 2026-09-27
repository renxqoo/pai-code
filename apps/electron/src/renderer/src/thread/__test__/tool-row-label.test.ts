import { describe, expect, test } from 'bun:test';

import { toolRowIcon } from '../tool-row-icon';
import { toolRowLabel, toolRowLabelOf } from '../tool-row-label';
import { toolGroupIcon } from '../tool-group-icon';
import type { ToolCallStatus } from '../thread-model';

/** lucide 组件的稳定展示名（各图标自报 class 里的 kebab 名）。 */
function iconName(name: string): string {
  const Icon = toolRowIcon(name);
  return (Icon as unknown as { displayName?: string }).displayName ?? Icon.name;
}

describe('toolRowLabel 单条执行行的状态前缀（用户裁决 3）', () => {
  test.each([
    ['bash', '已运行', '正在运行'],
    ['read', '已阅读', '正在阅读'],
    ['edit', '已编辑', '正在编辑'],
    ['write', '已写入', '正在写入'],
    ['grep', '已搜索', '正在搜索'],
    ['ls', '已列出', '正在列出'],
    ['task', '已派生子智能体', '正在派生子智能体'],
  ] as ReadonlyArray<readonly [string, string, string]>)('%s：终态过去式 / 运行中现在进行时', (tool, done, running) => {
    expect(toolRowLabel(tool, 'ok')).toBe(done);
    expect(toolRowLabel(tool, 'failed')).toBe(done);
    expect(toolRowLabel(tool, 'stopped')).toBe(done);
    expect(toolRowLabel(tool, 'running')).toBe(running);
  });

  test('未知工具直呼原名（不猜语义、不翻译）', () => {
    expect(toolRowLabel('mcp__x__y', 'ok')).toBe('已调用mcp__x__y');
    expect(toolRowLabel('mcp__x__y', 'running')).toBe('正在调用mcp__x__y');
  });

  test('工具名大小写不敏感（协议侧小写，扩展可能首字母大写）', () => {
    expect(toolRowLabel('Bash', 'ok')).toBe('已运行');
  });

  test('空工具名降级为空串（不悬空前缀）', () => {
    expect(toolRowLabel('', 'ok')).toBe('');
    expect(toolRowLabel('   ', 'running')).toBe('');
  });

  test('toolRowLabelOf 从调用本体取类型与状态', () => {
    expect(toolRowLabelOf({ name: 'read', status: 'ok' })).toBe('已阅读');
    expect(toolRowLabelOf({ name: 'read', status: 'running' })).toBe('正在阅读');
  });
});

describe('toolRowIcon / toolGroupIcon 类别图标', () => {
  test('单条行：编辑类铅笔、阅读书、命令终端、其余扳手', () => {
    expect(iconName('edit')).toBe(iconName('write'));
    expect(iconName('read')).not.toBe(iconName('bash'));
    expect(toolRowIcon('read')).toBe(toolRowIcon('read'));
    expect(toolRowIcon('bash')).toBe(toolRowIcon('bash'));
    expect(toolRowIcon('grep')).toBe(toolRowIcon('ls'));
  });

  test('组头：单一类别桶取该桶图标，混合批次落扳手', () => {
    const single: Parameters<typeof toolGroupIcon>[0] = [
      { id: '1', name: 'edit', argsPreview: '', subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 1, status: 'ok' },
      { id: '2', name: 'write', argsPreview: '', subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 1, status: 'ok' },
    ];
    expect(toolGroupIcon(single)).toBe(toolRowIcon('edit'));
    const mixed: Parameters<typeof toolGroupIcon>[0] = [
      ...single,
      { id: '3', name: 'read', argsPreview: '', subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 1, status: 'ok' },
    ];
    expect(toolGroupIcon(mixed)).toBe(toolRowIcon('grep'));
  });

  test('状态不影响图标（成败由行尾与详情承担）', () => {
    const base = { id: '1', name: 'bash', argsPreview: '', subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 1 } as const;
    const ok = toolGroupIcon([{ ...base, status: 'ok' as ToolCallStatus }]);
    const failed = toolGroupIcon([{ ...base, status: 'failed' as ToolCallStatus }]);
    expect(ok).toBe(failed);
  });
});
