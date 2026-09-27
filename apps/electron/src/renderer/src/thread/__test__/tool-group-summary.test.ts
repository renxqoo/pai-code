import { describe, expect, test } from 'bun:test';

import {
  toolGroupBuckets,
  toolGroupIsParallel,
  toolGroupLabel,
  toolGroupStatus,
} from '../tool-group-summary';
import type { ToolCallModel, ToolCallStatus } from '../thread-model';

function call(name: string, status: ToolCallStatus = 'ok', id?: string): ToolCallModel {
  return {
    id: id ?? name,
    name,
    argsPreview: 'x',
    subagents: [],
    editHunks: [],
    output: '',
    exitCode: status === 'failed' ? 1 : 0,
    durationMs: 10,
    status,
  };
}

describe('toolGroupLabel 文案合成（用户指定的四档逐字断言）', () => {
  test('都是命令：运行了命令', () => {
    expect(toolGroupLabel([call('bash'), call('bash', 'ok', 'b2')])).toBe('运行了命令');
  });

  test('都是编辑：编辑了文件（标题不带计数）', () => {
    expect(toolGroupLabel([call('edit'), call('edit', 'ok', 'e2'), call('edit', 'ok', 'e3')])).toBe('编辑了文件');
    // write 与 edit 同桶（都是文件改写）
    expect(toolGroupLabel([call('edit'), call('write', 'ok', 'w1')])).toBe('编辑了文件');
  });

  test('都是阅读：阅读了文件（标题不带计数）', () => {
    expect(toolGroupLabel([call('read'), call('read', 'ok', 'r2')])).toBe('阅读了文件');
  });

  test('编辑 + 命令：编辑了文件运行了命令（桶序固定）', () => {
    expect(toolGroupLabel([call('bash'), call('edit')])).toBe('编辑了文件运行了命令');
  });

  test('阅读 + 编辑 + 命令：三段流水，无连接词', () => {
    expect(toolGroupLabel([call('bash'), call('read'), call('edit')])).toBe('编辑了文件阅读了文件运行了命令');
  });

  test('命令顺序不影响标题（同批次标题稳定）', () => {
    expect(toolGroupLabel([call('edit'), call('bash')])).toBe(toolGroupLabel([call('bash'), call('edit')]));
  });

  test('搜索/目录/子智能体各自成短语', () => {
    expect(toolGroupLabel([call('grep'), call('grep', 'ok', 'g2')])).toBe('搜索了');
    expect(toolGroupLabel([call('ls'), call('ls', 'ok', 'l2')])).toBe('列出了目录');
    expect(toolGroupLabel([call('task'), call('task', 'ok', 't2')])).toBe('派生了子智能体');
  });

  test('类别超过三类：取前三并以「等」收口（标题不随桶数无界增长）', () => {
    const label = toolGroupLabel([call('edit'), call('read'), call('grep'), call('ls'), call('bash')]);
    expect(label).toBe('编辑了文件阅读了文件搜索了等');
  });
  test('未知工具：按原始名去重列举', () => {
    expect(toolGroupLabel([call('mcp__a'), call('mcp__a', 'ok', 'x2'), call('mcp__b')])).toBe('调用了mcp__a调用了mcp__b');
  });

  test('未知工具超过两个：并入「等」', () => {
    expect(toolGroupLabel([call('mcp__a'), call('mcp__b'), call('mcp__c')])).toBe('调用了mcp__a调用了mcp__b等');
  });

  test('空批次降级为空串（调用方不渲染组头）', () => {
    expect(toolGroupLabel([])).toBe('');
  });
});

describe('toolGroupStatus 批次聚合态', () => {
  test('失败优先于运行中（组级必须是失败色）', () => {
    expect(toolGroupStatus([call('bash', 'running'), call('bash', 'failed', 'b2')])).toBe('failed');
  });

  test('运行中优先于停止', () => {
    expect(toolGroupStatus([call('bash', 'stopped'), call('bash', 'running', 'b2')])).toBe('running');
  });

  test('无运行与失败时的停止仍显停止；全成功为成功', () => {
    expect(toolGroupStatus([call('bash', 'ok'), call('bash', 'stopped', 'b2')])).toBe('stopped');
    expect(toolGroupStatus([call('bash'), call('bash', 'ok', 'b2')])).toBe('ok');
  });

  test('空批次降级为成功', () => {
    expect(toolGroupStatus([])).toBe('ok');
  });
});

describe('toolGroupBuckets / toolGroupIsParallel', () => {
  test('桶序 = 短语序，与调用到达序无关', () => {
    expect(toolGroupBuckets([call('bash'), call('edit'), call('read')]).map((bucket) => bucket.kind)).toEqual([
      'edit',
      'read',
      'bash',
    ]);
  });

  test('edit 与 write 同属文件改写桶（标题与图标一致）', () => {
    expect(toolGroupBuckets([call('edit'), call('write', 'ok', 'w1')])).toHaveLength(1);
  });

  test('单调用不构成并行批次', () => {
    expect(toolGroupIsParallel([call('bash')])).toBe(false);
    expect(toolGroupIsParallel([call('bash'), call('bash', 'ok', 'b2')])).toBe(true);
  });
});
