import { describe, expect, test } from 'bun:test';

import { autoOpenForProcessGroup } from '../process-group-state';
import { processRuns } from '../process-runs';
import type { ToolCallModel, TurnBlock } from '../thread-model';

/**
 * 过程组的默认开合判据：默认收，两条例外（在途调用 / 子代理在跑）自动展开。
 *
 * 症状回归对应「中间过程组（后面还有正文）默认收」——现状里运行中的轮把十几行
 * 过程一次性铺开，正文读不下去。
 */

function call(id: string, name = 'bash', status: ToolCallModel['status'] = 'ok'): ToolCallModel {
  return { id, name, argsPreview: '', subagents: [], output: '', exitCode: 0, durationMs: 12, status };
}

/** blocks → 第 groupIndex 个**过程组**的默认开合（processRuns 的下标含正文段，故先筛）。 */
function openOf(blocks: readonly TurnBlock[], groupIndex: number, subagentBusy = false): boolean {
  const groups = processRuns(blocks).filter((run) => run.kind === 'process');
  const run = groups[groupIndex];
  if (run === undefined) throw new Error(`no process group at ${groupIndex}`);
  return autoOpenForProcessGroup({ run, subagentBusy });
}

describe('autoOpenForProcessGroup 逐组开合判据', () => {
  test('症状回归：中间过程组（后面还有正文）默认收，正文才读得下去', () => {
    const blocks: readonly TurnBlock[] = [
      { kind: 'tools', id: 'c1', calls: [call('a')] },
      { kind: 'text', id: 'x1', text: '第一段结论' },
      { kind: 'tools', id: 'c2', calls: [call('b')] },
      { kind: 'text', id: 'x2', text: '第二段结论' },
    ];
    expect(openOf(blocks, 0)).toBe(false);
    expect(openOf(blocks, 1)).toBe(false);
  });

  test('末尾过程组（后面无正文）同样收：轮展开后仍是标题 + 限高列表，不是十几行流水', () => {
    const blocks: readonly TurnBlock[] = [
      { kind: 'text', id: 'x1', text: '结论' },
      { kind: 'tools', id: 'c1', calls: [call('a')] },
    ];
    expect(openOf(blocks, 0)).toBe(false);
  });

  test('组内有失败不自动展开（失败信息在正文与错误块已有一份）', () => {
    const blocks: readonly TurnBlock[] = [
      { kind: 'tools', id: 'c1', calls: [call('a', 'bash', 'failed')] },
      { kind: 'text', id: 'x1', text: '结论' },
    ];
    expect(openOf(blocks, 0)).toBe(false);
  });

  test('组内有运行中的调用 → 自动展开（在途的那一条必须看得见）', () => {
    const blocks: readonly TurnBlock[] = [
      { kind: 'tools', id: 'c1', calls: [call('a', 'bash', 'running')] },
      { kind: 'text', id: 'x1', text: '结论' },
    ];
    expect(openOf(blocks, 0)).toBe(true);
  });

  test('有子代理在跑 → 自动展开（进度无别处可看，收起即信息丢失）', () => {
    const blocks: readonly TurnBlock[] = [
      { kind: 'tools', id: 'c1', calls: [call('a', 'task')] },
      { kind: 'text', id: 'x1', text: '结论' },
    ];
    expect(openOf(blocks, 0, true)).toBe(true);
    expect(openOf(blocks, 0, false)).toBe(false);
  });

  test('组内无调用（纯思考）默认收', () => {
    const blocks: readonly TurnBlock[] = [
      { kind: 'thinking', id: 't1', text: '先想清楚' },
      { kind: 'text', id: 'x1', text: '结论' },
    ];
    expect(openOf(blocks, 0)).toBe(false);
  });
});