import { describe, expect, test } from 'bun:test';

import { buildAnalysisScript, buildFollowUpScript } from '../demo-turn-script';
import { deriveLiveTurn } from '../derive-demo-turn';
import type { TurnModel } from '@/thread/thread-model';

const START = 1_000_000;

function toolsBlock(turn: TurnModel) {
  const block = turn.blocks.find((entry) => entry.kind === 'tools');
  return block !== undefined && block.kind === 'tools' ? block.calls : [];
}

describe('deriveLiveTurn 轮次生命周期', () => {
  test('running：块按时间轴逐条出现，未结束的命令显 running（无退出码）', () => {
    const { turn } = deriveLiveTurn({ turnId: 't', startedAt: START, script: buildFollowUpScript() }, START + 2000, null);
    expect(turn.status).toBe('running');
    expect(turn.endedAt).toBeNull();
    const calls = toolsBlock(turn);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: 'running', exitCode: null, durationMs: null });
  });

  test('completed：到达自动收尾时刻即折叠，命令带退出码与耗时', () => {
    const script = buildFollowUpScript();
    const { turn } = deriveLiveTurn({ turnId: 't', startedAt: START, script }, START + 46_000, null);
    expect(turn.status).toBe('completed');
    expect(turn.endedAt).toBe(START + 46_000);
    const calls = toolsBlock(turn);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ status: 'ok', exitCode: 0, durationMs: 3200 });
    // 非零退出码必须区别于成功
    expect(calls[1]).toMatchObject({ status: 'failed', exitCode: 1, durationMs: 5400 });
  });

  test('stopped：冻结在停止时刻，运行中的命令显 stopped 而不是成功', () => {
    const script = buildFollowUpScript();
    const { turn } = deriveLiveTurn({ turnId: 't', startedAt: START, script }, START + 9000, START + 3000);
    expect(turn.status).toBe('stopped');
    expect(turn.endedAt).toBe(START + 3000);
    const calls = toolsBlock(turn);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: 'stopped', exitCode: null, durationMs: 2200 });
  });

  test('垃圾观察时刻降级为轮次起点，不产生负耗时也不提前露块', () => {
    const { turn } = deriveLiveTurn({ turnId: 't', startedAt: START, script: buildFollowUpScript() }, Number.NaN, null);
    expect(turn.status).toBe('running');
    expect(turn.blocks.map((block) => block.kind)).toEqual(['text']);
  });

  test('diff 块按出现时刻产出（轮内尾块不变式）', () => {
    const script = {
      blocks: [
        { kind: 'text' as const, id: 'text-1', atMs: 0, text: '先改代码' },
        { kind: 'diff' as const, id: 'diff-1', atMs: 1000, diff: { changedFiles: 1, additions: 2, deletions: 0, files: [] } },
      ],
      completeAtMs: null,
    };
    const before = deriveLiveTurn({ turnId: 't', startedAt: START, script }, START + 500, null);
    expect(before.turn.blocks.map((block) => block.kind)).toEqual(['text']);
    const after = deriveLiveTurn({ turnId: 't', startedAt: START, script }, START + 2000, null);
    expect(after.turn.blocks.map((block) => block.kind)).toEqual(['text', 'diff']);
  });
});

describe('deriveLiveTurn 子代理（面板数据面，不进轮内块）', () => {
  test('首帧（76s）四子代理并行：年龄 29s/23s/15s/6s，前三个有 token 计量', () => {
    const { agents } = deriveLiveTurn(
      { turnId: 't', startedAt: START, script: buildAnalysisScript() },
      START + 76_000,
      null,
    );
    expect(agents.map((entry) => entry.name)).toHaveLength(4);
    expect(agents.map((entry) => 76_000 - 47_000 - (entry.startedAt - START - 47_000))).toEqual([29_000, 23_000, 15_000, 6_000]);
    expect(agents.map((entry) => entry.tokens)).toEqual([51, 51, 94, null]);
    expect(agents.every((entry) => entry.status === 'working')).toBe(true);
  });

  test('进行中的子代理有当前工具，未开始工具的子代理无工具行', () => {
    const { agents } = deriveLiveTurn(
      { turnId: 't', startedAt: START, script: buildAnalysisScript() },
      START + 76_000,
      null,
    );
    expect(agents[0]?.tools.filter((call) => call.status === 'running')).toHaveLength(1);
    expect(agents[1]?.tools.filter((call) => call.status === 'running')).toHaveLength(1);
    expect(agents[2]?.tools.filter((call) => call.status === 'running')).toHaveLength(1);
    expect(agents[3]?.tools).toHaveLength(0);
  });

  test('到达自动收尾时刻：全部子代理完成并携带报告摘要', () => {
    const script = buildAnalysisScript();
    const { turn, agents } = deriveLiveTurn({ turnId: 't', startedAt: START, script }, START + 190_000, null);
    expect(turn.status).toBe('completed');
    expect(agents.every((entry) => entry.status === 'done')).toBe(true);
    expect(agents.every((entry) => entry.summary.length > 0)).toBe(true);
  });

  test('块未到出现时刻：无子代理产出（reveal 前空数据面）', () => {
    const { turn, agents } = deriveLiveTurn(
      { turnId: 't', startedAt: START, script: buildAnalysisScript() },
      START + 40_000,
      null,
    );
    expect(turn.status).toBe('running');
    expect(agents).toEqual([]);
  });

  test('用户停止：未完成的子代理被截断冻结，不带报告摘要', () => {
    const script = buildAnalysisScript();
    const { turn, agents } = deriveLiveTurn({ turnId: 't', startedAt: START, script }, START + 100_000, START + 100_000);
    expect(turn.status).toBe('stopped');
    const cutOff = agents.filter((entry) => entry.summary.length === 0);
    expect(cutOff.length).toBeGreaterThan(0);
    expect(cutOff.every((entry) => entry.status === 'done' && entry.endedAt === START + 100_000)).toBe(true);
  });
});
