import { describe, expect, test } from 'bun:test';

import { toolRowLabel, toolRowLabelOf } from '../tool-row-label';
import type { ToolCallStatus } from '@paiapp/contracts';
import { zhToolCopy } from './zh-tool-copy';

const label = (name: string, status: ToolCallStatus): string => toolRowLabel(name, status, zhToolCopy);

describe('toolRowLabel 单条执行行的状态前缀', () => {
  test.each([
    ['bash', '已运行', '正在运行'],
    ['read', '已阅读', '正在阅读'],
    ['edit', '已编辑', '正在编辑'],
    ['write', '已写入', '正在写入'],
    ['grep', '已搜索', '正在搜索'],
    ['ls', '已列出', '正在列出'],
    ['task', '已派生智能体', '正在派生智能体'],
  ] as ReadonlyArray<readonly [string, string, string]>)('%s：成功过去式 / 运行中现在进行时', (tool, done, running) => {
    expect(label(tool, 'ok')).toBe(done);
    expect(label(tool, 'running')).toBe(running);
  });

  test('失败整句成「运行失败」（一列执行行里失败那条必须一眼能找到，不靠行尾红字）', () => {
    for (const tool of ['bash', 'read', 'edit', 'write', 'grep', 'ls', 'task']) {
      expect(label(tool, 'failed')).toBe('运行失败');
    }
  });

  test('停止态整句成「已停止」', () => {
    for (const tool of ['bash', 'read', 'edit']) {
      expect(label(tool, 'stopped')).toBe('已停止');
    }
  });

  test('失败/停止文案必须与成功不同（否则这次改动等于没做）', () => {
    expect(label('bash', 'failed')).not.toBe(label('bash', 'ok'));
    expect(label('bash', 'stopped')).not.toBe(label('bash', 'ok'));
  });

  test('未知工具：各状态直呼原名', () => {
    expect(label('mcp__x__y', 'ok')).toBe('已调用mcp__x__y');
    expect(label('mcp__x__y', 'running')).toBe('正在调用mcp__x__y');
    expect(label('mcp__x__y', 'failed')).toBe('调用失败mcp__x__y');
    expect(label('mcp__x__y', 'stopped')).toBe('已停止mcp__x__y');
  });

  test('工具名大小写不敏感（协议侧小写，扩展可能首字母大写）', () => {
    expect(label('Bash', 'ok')).toBe('已运行');
    expect(label('Bash', 'failed')).toBe('运行失败');
  });

  test('空工具名降级为空串（不悬空前缀）', () => {
    expect(label('', 'ok')).toBe('');
    expect(label('   ', 'running')).toBe('');
    expect(label('', 'failed')).toBe('');
  });

  test('toolRowLabelOf 从调用本体取类型与状态', () => {
    expect(toolRowLabelOf({ name: 'read', status: 'ok' }, zhToolCopy)).toBe('已阅读');
    expect(toolRowLabelOf({ name: 'read', status: 'running' }, zhToolCopy)).toBe('正在阅读');
    expect(toolRowLabelOf({ name: 'read', status: 'failed' }, zhToolCopy)).toBe('运行失败');
  });
});
