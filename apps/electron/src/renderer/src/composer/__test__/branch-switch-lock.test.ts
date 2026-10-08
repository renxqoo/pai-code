import { describe, expect, test } from 'bun:test';

import { hasRetryInFlight, foldThreadEvent } from '@/live/fold-events';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';

import { branchSwitchLocked } from '../branch-switch-lock';

/**
 * 分支切换锁（T36 引用 T23 裁决）：目标目录上任一线程在跑即锁定。
 * 在跑的判定面：streaming / 子 agent working / 直执行 bash / 自动重试
 * （重试在途 = live running 轮上存在 retry 块，hasRetryInFlight 派生）。
 */

function thread(patch: Partial<LiveThreadState>): LiveThreadState {
  return { ...initialThreadState, ...patch };
}

function threadWithRetry(): LiveThreadState {
  let s = thread({});
  s = foldThreadEvent(s, { type: 'turnStarted', threadId: 't1', at: 1 }, 1);
  s = foldThreadEvent(s, { type: 'retrying', threadId: 't1', turn: 0, step: 0, attempt: 1, code: 'http-429', message: 'x' }, 2);
  return s;
}

describe('branchSwitchLocked', () => {
  test('空闲目录不锁', () => {
    expect(branchSwitchLocked({ t1: { cwd: '/w/repo' } }, { t1: thread({}) }, '/w/repo')).toBe(false);
  });

  test.each([
    ['流式回复中', thread({ streaming: true })],
    ['直执行 bash 在途', thread({ bashRunning: true })],
    ['自动重试中', threadWithRetry()],
  ])('%s → 锁定', (_name: string, busy: LiveThreadState) => {
    expect(branchSwitchLocked({ t1: { cwd: '/w/repo' } }, { t1: busy }, '/w/repo')).toBe(true);
  });

  test('重试在途判定来自 retry 块（结算后无块即不锁：单一表示无残留标量）', () => {
    let s = threadWithRetry();
    expect(hasRetryInFlight(s)).toBe(true);
    s = foldThreadEvent(s, { type: 'turnSettled', threadId: 't1', ok: true, usage: null }, 3);
    expect(hasRetryInFlight(s)).toBe(false);
    expect(branchSwitchLocked({ t1: { cwd: '/w/repo' } }, { t1: s }, '/w/repo')).toBe(false);
  });

  test('子 agent 在跑 → 锁定', () => {
    const working = thread({
      agents: [
        {
          id: 'a1',
          agentId: 'sub-1',
          name: 'Researcher',
          agentType: 'Explore',
          task: '',
          model: 'openai/gpt',
          effort: 'medium',
          tokens: 5,
          toolCount: 0,
          status: 'running',
          startedAt: 1,
          endedAt: null,
          summary: '',
          pendingAsk: null,
          tools: [],
        },
      ],
    });
    expect(branchSwitchLocked({ t1: { cwd: '/w/repo' } }, { t1: working }, '/w/repo')).toBe(true);
  });

  test('在跑的是别的目录 → 不锁本目录（并行仓库互不影响）', () => {
    const busy = thread({ streaming: true });
    expect(branchSwitchLocked({ t1: { cwd: '/w/other' } }, { t1: busy }, '/w/repo')).toBe(false);
  });

  test('会话缺 cwd（会话未水化）的忙碌线程不参与判定；无目录恒锁（不给切换入口）', () => {
    const busy = thread({ streaming: true });
    expect(branchSwitchLocked({}, { t1: busy }, '/w/repo')).toBe(false);
    expect(branchSwitchLocked({ t1: { cwd: '/w/repo' } }, { t1: thread({}) }, '')).toBe(true);
  });
});
