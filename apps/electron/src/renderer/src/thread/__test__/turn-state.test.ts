import { describe, expect, test } from 'bun:test';

import { isTurnRunning, turnElapsedMs } from '../turn-state';
import { turnTextContent } from '../turn-text';

describe('turnElapsedMs', () => {
  const startedAt = 1_000_000;

  test('运行中的轮走表，最小为 0', () => {
    expect(turnElapsedMs({ status: 'running', startedAt, endedAt: null }, startedAt + 76_000)).toBe(76_000);
    expect(turnElapsedMs({ status: 'running', startedAt, endedAt: null }, startedAt - 1)).toBe(0);
  });

  test('completed / stopped 冻结在 endedAt，忽略观察时刻', () => {
    const turn = { status: 'completed' as const, startedAt, endedAt: startedAt + 12_000 };
    expect(turnElapsedMs(turn, startedAt + 999_000)).toBe(12_000);
    const stopped = { status: 'stopped' as const, startedAt, endedAt: startedAt + 5_000 };
    expect(turnElapsedMs(stopped, startedAt + 999_000)).toBe(5_000);
  });

  test('垃圾输入降级为 0：endedAt 缺失、时间倒挂、非有限值', () => {
    expect(turnElapsedMs({ status: 'completed', startedAt, endedAt: null }, startedAt + 1)).toBe(0);
    expect(turnElapsedMs({ status: 'completed', startedAt, endedAt: startedAt - 100 }, startedAt)).toBe(0);
    expect(turnElapsedMs({ status: 'running', startedAt: Number.NaN, endedAt: null }, startedAt)).toBe(0);
  });
});

describe('isTurnRunning', () => {
  test('状态判别', () => {
    expect(isTurnRunning({ status: 'running' })).toBe(true);
    expect(isTurnRunning({ status: 'stopped' })).toBe(false);
  });
});

describe('turnTextContent', () => {
  test('只取文本块并按空行拼接，供时间戳行的复制入口使用', () => {
    const turn = {
      blocks: [
        { kind: 'text' as const, id: 'a', text: '第一段' },
        { kind: 'tools' as const, id: 'b', calls: [] },
        { kind: 'text' as const, id: 'c', text: '第二段' },
      ],
    };
    expect(turnTextContent(turn)).toBe('第一段\n\n第二段');
  });

  test('无文本块时输出空字符串', () => {
    expect(turnTextContent({ blocks: [] })).toBe('');
  });
});
