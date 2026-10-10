/**
 * 症状：手机端对话列表把 PC 侧会话显示成「未命名对话 + 20734 天前」。
 * 机理：thread/list（live 行）只有运行态字段，标题与最后活动时间只在
 * thread/list_saved 面——两份按 threadId 归并后补齐；同时缺活动时间时
 * 不得渲染出「N 天前」这种假时间。
 */
import { beforeEach, describe, expect, it } from '@jest/globals';

import { withSavedMeta } from '../../relay/with-saved-meta';
import { createHistorySync } from '../history-sync';
import type { ConversationSession } from '@/types/domain';

const liveRows = [
  { threadId: 't1', cwd: '/w', state: 'live', streaming: false, sessionPath: '/s/t1.jsonl' },
  { threadId: 't2', cwd: '/w', state: 'parked', streaming: false, sessionPath: '/s/t2.jsonl' },
];

const savedRows = [
  { sessionId: 't1', title: 'PC 会话 甲', cwd: '/w', lastActivityAt: Date.now() - 30_000 },
  { sessionId: 't2', title: 'PC 会话 乙', cwd: '/other', lastActivityAt: Date.now() - 7_200_000 },
];

describe('列表元数据归并（症状：未命名对话 + 20734 天前）', () => {
  let emitted: ConversationSession[][];
  beforeEach(() => {
    emitted = [];
  });

  it('withSavedMeta：live 行补上标题与最后活动时间，运行态字段不被覆盖', () => {
    const merged = withSavedMeta(liveRows, savedRows);
    expect(merged[0]).toMatchObject({ title: 'PC 会话 甲', state: 'live', streaming: false });
    expect(merged[1]).toMatchObject({ title: 'PC 会话 乙', state: 'parked' });
  });

  it('withSavedMeta：saved 无对应行时保持缺省（不编造标题）', () => {
    const merged = withSavedMeta([{ threadId: 'tx', cwd: '/w', state: 'live', streaming: false, sessionPath: null }], []);
    expect(merged[0]?.['title']).toBeUndefined();
    expect(merged[0]?.['lastActivityAt']).toBeUndefined();
  });

  it('seedBootstrap 端到端：列表显示真实标题与相对时间，无「N 天前」假时间', () => {
    createHistorySync({ onSessions: (sessions) => emitted.push(sessions) }).seedBootstrap(
      withSavedMeta(liveRows, savedRows) as never,
      savedRows as never,
      {},
    );
    const sessions = emitted[emitted.length - 1] ?? [];
    const first = sessions.find((session) => session.id === 't1');
    expect(first?.title).toBe('PC 会话 甲');
    expect(first?.timeLabel).toBe('刚刚');
    expect(first?.timeLabel).not.toMatch(/天前/);
  });

  it('缺最后活动时间 → 时间标签留空，不渲染「20734 天前」', () => {
    createHistorySync({ onSessions: (sessions) => emitted.push(sessions) }).seedBootstrap(
      [{ threadId: 't9', cwd: '/w', state: 'live', sessionPath: null }] as never,
      [],
      {},
    );
    expect((emitted[emitted.length - 1] ?? [])[0]?.timeLabel).toBe('');
  });

  it('不在宿主表的已落盘会话标 detached（手机端唤不活，UI 需显式告知）', () => {
    createHistorySync({ onSessions: (sessions) => emitted.push(sessions) }).seedBootstrap(
      liveRows as never,
      [...savedRows, { sessionId: 'tOld', title: '归档会话', lastActivityAt: Date.now() }] as never,
      {},
    );
    const sessions = emitted[emitted.length - 1] ?? [];
    expect(sessions.find((session) => session.id === 'tOld')?.detached).toBe(true);
    expect(sessions.find((session) => session.id === 't1')?.detached).toBeUndefined();
  });

  it('带 sessionPath 的归档会话不再 detached：可按路径唤活，状态为待处理', () => {
    // 症状：PC 回收过 worker 的会话在手机端一律标「需在电脑端打开」，发消息必然失败——
    // 而 host 只要拿到 sessionPath 就能 resume，该会话其实完全可用。
    createHistorySync({ onSessions: (sessions) => emitted.push(sessions) }).seedBootstrap(
      liveRows as never,
      [{ sessionId: 'tOld', sessionPath: '/s/tOld.jsonl', title: '归档会话', cwd: '/w', lastActivityAt: Date.now() }] as never,
      {},
    );
    const sessions = emitted[emitted.length - 1] ?? [];
    const row = sessions.find((session) => session.id === 'tOld');
    expect(row?.detached).toBe(false);
    expect(row?.state).toBe('idle');
    expect(row?.title).toBe('归档会话');
  });
});