import { describe, expect, test } from 'bun:test';

import { buildAnalysisScript } from '../demo-turn-script';
import { deriveDemoThread } from '../derive-demo-thread';
import type { DemoThreadSpec } from '../demo-thread-spec';
import type { TurnModel } from '@/thread/thread-model';

const START = 1_000_000;
const NOW = START + 76_000;

const doneTurn: TurnModel = {
  id: 'turn-done',
  status: 'completed',
  startedAt: START - 60_000,
  endedAt: START - 1000,
  blocks: [
    { kind: 'text', id: 'text', text: '已完成的一轮' },
    { kind: 'diff', id: 'diff', diff: { changedFiles: 2, additions: 10, deletions: 4, files: [] } },
  ],
};

const spec: DemoThreadSpec = {
  sessionId: 'session-1',
  items: [
    { kind: 'message', message: { id: 'm1', role: 'user', text: '深度分析当前项目' } },
    { kind: 'turn', turn: doneTurn },
    { kind: 'live-turn', turnId: 'turn-live', startedAt: START, script: buildAnalysisScript() },
  ],
};

describe('deriveDemoThread', () => {
  test('静态条目直出，live 轮次按观察时刻折算', () => {
    const thread = deriveDemoThread(spec, NOW, {});
    expect(thread.items).toHaveLength(3);
    expect(thread.items[0]).toMatchObject({ kind: 'message' });
    expect(thread.items[1]).toMatchObject({ kind: 'turn', turn: { id: 'turn-done', status: 'completed' } });
    expect(thread.items[2]).toMatchObject({ kind: 'turn', turn: { id: 'turn-live', status: 'running' } });
  });

  test('子代理平铺为面板列表（数据面，不进轮内块）', () => {
    const thread = deriveDemoThread(spec, NOW, {});
    expect(thread.agents).toHaveLength(4);
    expect(thread.agents.map((agent) => agent.id)).toEqual([
      'agent-adapters',
      'agent-router',
      'agent-middleware',
      'agent-testing',
    ]);
    expect(thread.agents.every((agent) => agent.status === 'working')).toBe(true);
  });

  test('停止表命中时冻结该轮，未命中或未来时刻按未停止处理', () => {
    const stopped = deriveDemoThread(spec, NOW, { 'session-1:turn-live': NOW - 1000 });
    expect(stopped.items[2]).toMatchObject({ kind: 'turn', turn: { status: 'stopped' } });
    const future = deriveDemoThread(spec, NOW, { 'session-1:turn-live': NOW + 5000 });
    expect(future.items[2]).toMatchObject({ kind: 'turn', turn: { status: 'running' } });
    const otherSession = deriveDemoThread(spec, NOW, { 'session-2:turn-live': NOW - 1000 });
    expect(otherSession.items[2]).toMatchObject({ kind: 'turn', turn: { status: 'running' } });
  });

  test('未知会话规格降级为空线程，不抛错', () => {
    const thread = deriveDemoThread({ sessionId: 'none', items: [] }, NOW, {});
    expect(thread).toEqual({ sessionId: 'none', items: [], agents: [] });
  });
});
