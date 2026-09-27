import { describe, expect, test } from 'bun:test';

import { toolRowIcon } from '../tool-row-icon';
import { toolRowLabel, toolRowLabelOf } from '../tool-row-label';
import { toolGroupIcon } from '../tool-group-icon';
import type { ToolCallStatus } from '../thread-model';

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
  ] as ReadonlyArray<readonly [string, string, string]>)('%s：成功过去式 / 运行中现在进行时', (tool, done, running) => {
    expect(toolRowLabel(tool, 'ok')).toBe(done);
    expect(toolRowLabel(tool, 'running')).toBe(running);
  });

  test('失败整句成「运行失败」（一列执行行里失败那条必须一眼能找到，不靠行尾红字）', () => {
    for (const tool of ['bash', 'read', 'edit', 'write', 'grep', 'ls', 'task']) {
      expect(toolRowLabel(tool, 'failed')).toBe('运行失败');
    }
  });

  test('停止态整句成「已停止」', () => {
    for (const tool of ['bash', 'read', 'edit']) {
      expect(toolRowLabel(tool, 'stopped')).toBe('已停止');
    }
  });

  test('失败/停止文案必须与成功不同（否则这次改动等于没做）', () => {
    expect(toolRowLabel('bash', 'failed')).not.toBe(toolRowLabel('bash', 'ok'));
    expect(toolRowLabel('bash', 'stopped')).not.toBe(toolRowLabel('bash', 'ok'));
  });

  test('未知工具：各状态直呼原名', () => {
    expect(toolRowLabel('mcp__x__y', 'ok')).toBe('已调用mcp__x__y');
    expect(toolRowLabel('mcp__x__y', 'running')).toBe('正在调用mcp__x__y');
    expect(toolRowLabel('mcp__x__y', 'failed')).toBe('调用失败mcp__x__y');
    expect(toolRowLabel('mcp__x__y', 'stopped')).toBe('已停止mcp__x__y');
  });

  test('工具名大小写不敏感（协议侧小写，扩展可能首字母大写）', () => {
    expect(toolRowLabel('Bash', 'ok')).toBe('已运行');
    expect(toolRowLabel('Bash', 'failed')).toBe('运行失败');
  });

  test('空工具名降级为空串（不悬空前缀）', () => {
    expect(toolRowLabel('', 'ok')).toBe('');
    expect(toolRowLabel('   ', 'running')).toBe('');
    expect(toolRowLabel('', 'failed')).toBe('');
  });

  test('toolRowLabelOf 从调用本体取类型与状态', () => {
    expect(toolRowLabelOf({ name: 'read', status: 'ok' })).toBe('已阅读');
    expect(toolRowLabelOf({ name: 'read', status: 'running' })).toBe('正在阅读');
    expect(toolRowLabelOf({ name: 'read', status: 'failed' })).toBe('运行失败');
  });
});

describe('toolRowIcon / toolGroupIcon 类别图标', () => {
  test('单条行：编辑类铅笔、阅读书、命令终端、其余扳手', () => {
    expect(iconName('edit')).toBe(iconName('write'));
    expect(iconName('read')).not.toBe(iconName('bash'));
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

  test('状态不影响图标（成败由文案承担，不由图标变色）', () => {
    const base = { id: '1', name: 'bash', argsPreview: '', subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 1 } as const;
    expect(toolGroupIcon([{ ...base, status: 'ok' as ToolCallStatus }])).toBe(
      toolGroupIcon([{ ...base, status: 'failed' as ToolCallStatus }]),
    );
  });
});
