import { describe, expect, test } from 'bun:test';

import { initialThreadState } from '@/live/live-thread-state';

import { branchSwitchLocked } from '../branch-switch-lock';

/**
 * 分支切换锁（T36 引用 T23 裁决）：目标目录上任一线程在跑即锁定。
 * 在跑的判定面：streaming / 子 agent working / 直执行 bash / 自动重试。
 */

function thread(patch: Partial<ReturnType<typeof initialThreadState>>): ReturnType<typeof initialThreadState> {
  return { ...initialThreadState, ...patch };
}

describe('branchSwitchLocked', () => {
  test('空闲目录不锁', () => {
    expect(branchSwitchLocked({ t1: { cwd: '/w/repo' } }, { t1: thread({}) }, '/w/repo')).toBe(false);
  });

  test.each([
    ['流式回复中', thread({ streaming: true })],
    ['直执行 bash 在途', thread({ bashRunning: true })],
    ['自动重试中', thread({ retrying: { attempt: 1, maxAttempts: 3, errorMessage: 'x' } })],
  ])('%s → 锁定', (_name: string, busy: ReturnType<typeof initialThreadState>) => {
    expect(branchSwitchLocked({ t1: { cwd: '/w/repo' } }, { t1: busy }, '/w/repo')).toBe(true);
  });

  test('子 agent 在跑 → 锁定', () => {
    const working = thread({
      agents: [
        {
          id: 'a1',
          name: 'Researcher',
          agentType: 'Explore',
          model: 'openai/gpt',
          effort: 'medium',
          tokens: 5,
          toolCount: 0,
          status: 'working',
          startedAt: 1,
          endedAt: null,
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
