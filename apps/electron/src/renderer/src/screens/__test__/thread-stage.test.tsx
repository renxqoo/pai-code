import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { copy } from '@/strings';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import type { SessionView } from '@paiapp/contracts';
import { ThreadStage } from '../thread-stage';

/**
 * T27 回归（T34 M2 区域化后改 store 种子 + 客户端渲染口径）：历史水化失败的
 * parked 会话不再静默呈现为「还没有消息」空态——失败标题 + 重试按钮可见；
 * 正常空会话保持引导文案且无重试按钮。
 */

function seedActiveThread(thread: Partial<LiveThreadState> = {}): void {
  const session: SessionView = {
    threadId: 't1',
    cwd: '/tmp/pai',
    sessionPath: '/tmp/pai/s/t1.jsonl',
    title: '会话',
    state: 'parked',
    streaming: false,
    model: 'm',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
  liveStore.setState({
    sessions: { t1: session },
    activeThreadId: 't1',
    threads: { t1: { ...initialThreadState, ...thread } },
  });
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

describe('ThreadStage 空态（T27：水化失败不静默）', () => {
  test('hydrateFailed：失败标题 + 重试按钮，不显示空会话引导文案', () => {
    seedActiveThread({ hydrateFailed: true });
    const view = render(<ThreadStage />);
    expect(view.container.textContent).toContain(copy.flow.hydrateFailedTitle);
    expect(view.container.textContent).toContain(copy.thread.retryHydration);
    expect(view.container.textContent).not.toContain(copy.thread.emptyTitle);
    view.unmount();
  });

  test('正常空会话：引导文案，无重试按钮', () => {
    seedActiveThread();
    const view = render(<ThreadStage />);
    expect(view.container.textContent).toContain(copy.thread.emptyTitle);
    expect(view.container.textContent).not.toContain(copy.flow.hydrateFailedTitle);
    expect(view.container.textContent).not.toContain(copy.thread.retryHydration);
    view.unmount();
  });

  test('无会话空舞台：新建任务引导文案，不承诺「描述即可开始」（发送无定址目标）', () => {
    const view = render(<ThreadStage />);
    expect(view.container.textContent).toContain(copy.thread.noSessionTitle);
    expect(view.container.textContent).toContain(copy.thread.noSessionHint);
    // 「描述…即可开始」只属于真实会话的空轮次；无会话状态下它是空头支票
    expect(view.container.textContent).not.toContain(copy.thread.emptyHint);
    view.unmount();
  });
});

describe('ThreadStage 发送回底（用户主动发送 → 滚到最新）', () => {
  test('症状「发送后停在历史中部看不到回执」：已让位前置态下回底信号即滚到底', () => {
    seedActiveThread();
    const view = render(<ThreadStage />);
    const scroller = view.container.querySelector('.overflow-y-auto');
    if (!(scroller instanceof HTMLDivElement)) throw new Error('thread scroller not found');
    // 桩滚动几何（happy-dom 无排版；scrollTop 钳制与浏览器一致）
    let scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(Math.max(value, 0), 500);
      },
      configurable: true,
    });
    Object.defineProperty(scroller, 'scrollHeight', { get: () => 1_000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { get: () => 500, configurable: true });
    // reduced-motion 降级直接定位（与回底同约定），matchMedia 桩成命中
    const windowStub = window as unknown as { matchMedia: (query: string) => { matches: boolean } };
    const original = windowStub.matchMedia;
    windowStub.matchMedia = (query: string): { matches: boolean } => ({ matches: query.includes('prefers-reduced-motion') });
    try {
      // 建立「已让位」前置态（用户上翻读历史，滚动事件落位）——症状的真实起点
      React.act(() => {
        scroller.scrollTop = 500;
        scroller.dispatchEvent(new Event('scroll'));
        scroller.scrollTop = 200;
        scroller.dispatchEvent(new Event('scroll'));
      });
      React.act(() => {
        uiStore.getState().requestFollowLatest('t1');
      });
      expect(scroller.scrollTop).toBe(500);
      view.unmount();
    } finally {
      windowStub.matchMedia = original;
    }
  });
});
