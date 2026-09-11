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
});
