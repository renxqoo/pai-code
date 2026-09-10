import { describe, expect, test } from 'bun:test';

import { statsTargetsOf } from '../stats-targets';

/**
 * T27 回归：worker 级统计查询只面向 live 会话——parked 会话的 stats 扇出
 * 会唤醒全部 worker（浏览性唤醒），目标集判定收在纯函数单一真相。
 */
describe('statsTargetsOf（T27：stats 只查 live 会话）', () => {
  test('live 全收，parked/dead 全滤', () => {
    const sessions = {
      a: { state: 'live' },
      b: { state: 'parked' },
      c: { state: 'dead' },
      d: { state: 'live' },
    };
    expect(statsTargetsOf(sessions)).toEqual(['a', 'd']);
  });

  test('空表与全 parked 表都为空（零 worker 级查询）', () => {
    expect(statsTargetsOf({})).toEqual([]);
    expect(statsTargetsOf({ x: { state: 'parked' } })).toEqual([]);
  });
});
