import { afterEach, beforeEach, expect, test } from 'bun:test';
import * as React from 'react';

import { WorkspaceMain } from '../workspace-main';
import { ThemeProvider } from '@/components/theme-provider';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import { installDom } from '@/testing/dom';
import type { SessionView } from '@paiapp/contracts';

/**
 * 症状回归「消息被输入浮层遮挡（滚动到底仍被切）」：浮层避让高度必须始终反映
 * 浮层实测高度（+24 呼吸）。浮层容器在新建任务页往返时会卸载重挂——观测挂在
 * 元素上随之换绑；deps 固定的旧形态会在往返后冻结在初始值 184，浮层 ~230 时
 * 底部内容被切 ~46px。
 */

/** 浮层几何桩：happy-dom 无真实排版，按类名命中浮层容器返回受控高度。 */
let overlayHeight = 230;

function patchOverlayGeometry(): () => void {
  HTMLDivElement.prototype.getBoundingClientRect = function (this: HTMLDivElement) {
    if (this.className.includes('pointer-events-none absolute inset-x-0 bottom-0')) {
      return {
        height: overlayHeight,
        width: 800,
        top: 0,
        left: 0,
        right: 800,
        bottom: overlayHeight,
        x: 0,
        y: 0,
      } as DOMRect;
    }
    return Element.prototype.getBoundingClientRect.call(this);
  };
  return () => {
    delete (HTMLDivElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  };
}

function seed(): void {
  const session: SessionView = {
    threadId: 't1',
    cwd: '/tmp/pai',
    sessionPath: '/tmp/pai/s/t1.jsonl',
    title: '会话-t1',
    state: 'live',
    streaming: false,
    model: 'm',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
  liveStore.setState({ sessions: { t1: session }, activeThreadId: 't1', threads: { t1: initialThreadState } });
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

test('症状回归：浮层避让随实测高度更新——新建任务页往返后不冻结在初始值', () => {
  installDom();
  const restore = patchOverlayGeometry();
  try {
    overlayHeight = 230;
    seed();
    const view = render(
      <ThemeProvider>
        <WorkspaceMain />
      </ThemeProvider>,
    );
    expect(uiStore.getState().composerInset).toBe(254);

    // 新建任务页往返：浮层容器卸载重挂，重挂后浮层更高（多行草稿/排队卡形态）
    overlayHeight = 300;
    React.act(() => {
      uiStore.getState().openNewTask('');
    });
    view.rerender(
      <ThemeProvider>
        <WorkspaceMain />
      </ThemeProvider>,
    );
    React.act(() => {
      uiStore.getState().closeNewTask();
    });
    view.rerender(
      <ThemeProvider>
        <WorkspaceMain />
      </ThemeProvider>,
    );
    expect(uiStore.getState().composerInset).toBe(324);
    view.unmount();
  } finally {
    restore();
  }
});
