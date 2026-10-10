import { describe, expect, test } from 'bun:test';

import type { SessionStatsView } from '@x3code/contracts';

import type { SessionCardModel } from '@/sidebar/session-card-model';

import { buildUsageEntries } from '../usage-entries';

const card = (over: Partial<SessionCardModel> = {}): SessionCardModel => ({
  id: 't1',
  projectName: 'app',
  title: '会话一',
  version: 'glm/glm-5.3',
  cwd: '/w/app',
  sessionPath: '/w/app/s/t1.jsonl',
  state: 'live',
  streaming: false,
  lastActivityAt: 1,
  ...over,
});

const stats = (total: number, cost: number, user: number, assistant: number): SessionStatsView =>
  ({ userMessages: user, assistantMessages: assistant, toolCalls: 0, tokens: { input: 0, output: 0, total }, cost }) as SessionStatsView;

describe('buildUsageEntries（会话卡 × 用量快照）', () => {
  test('有快照取实值；缺快照按 0 呈现（不缺位）', () => {
    const rows = buildUsageEntries(
      [card(), card({ id: 't2', title: '会话二' })],
      { t1: stats(5200, 1.25, 3, 4) },
    );
    expect(rows).toEqual([
      { title: '会话一', projectName: 'app', model: 'glm/glm-5.3', tokensTotal: 5200, cost: 1.25, messageCount: 7 },
      { title: '会话二', projectName: 'app', model: 'glm/glm-5.3', tokensTotal: 0, cost: 0, messageCount: 0 },
    ]);
  });

  test('空会话表 → 空条目', () => {
    expect(buildUsageEntries([], {})).toEqual([]);
  });
});
