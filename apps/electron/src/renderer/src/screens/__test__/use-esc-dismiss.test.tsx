import { afterEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { render } from '@/testing/render';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { useEscDismiss } from '../use-esc-dismiss';

/**
 * Esc 全局分发矩阵（escActionFor 词表的动作映射层）：本地浮层/新建页/停止确认/
 * 运行中停止/bash 中止各就各位；空闲无动作不误触。
 */

type ProbeProps = {
  localDialogOpen: boolean
  panelOpen: boolean
  calls: string[]
};

function EscProbe({ localDialogOpen, panelOpen, calls }: ProbeProps): null {
  useEscDismiss({
    localDialogOpen,
    paletteOpen: false,
    panelOpen,
    onPaletteClose: () => calls.push('palette'),
    onPanelClose: () => calls.push('panel'),
    abortBash: () => calls.push('abortBash'),
    stopActiveTurn: () => calls.push('stopActiveTurn'),
  });
  return null;
}

function seedLive(streaming: boolean, bashRunning: boolean): void {
  liveStore.setState({
    sessions: {
      t1: {
        threadId: 't1',
        cwd: '/w/app',
        sessionPath: '/w/app/s/t1.jsonl',
        title: '会话',
        state: 'live',
        streaming,
        model: 'glm/glm-5.3',
        thinkingLevel: null,
        lastActivityAt: Date.now(),
      },
    },
    activeThreadId: 't1',
    threads: { t1: { ...initialThreadState, streaming, bashRunning } },
  });
}

function pressEsc(): void {
  React.act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  liveStore.getState().reset();
  uiStore.getState().reset();
});

describe('useEscDismiss 分发', () => {
  function mount(over: Partial<ProbeProps> = {}): { calls: string[]; unmount: () => void } {
    const calls: string[] = [];
    const view = render(<EscProbe localDialogOpen={false} panelOpen={false} calls={calls} {...over} />);
    return { calls, unmount: view.unmount };
  }

  test('新建任务页开着：Esc 关整页（不落在停止动作上）', () => {
    seedLive(false, false);
    uiStore.getState().openNewTask('');
    const { calls, unmount } = mount();
    pressEsc();
    expect(uiStore.getState().newTaskOpen).toBe(false);
    expect(calls).toEqual([]);
    unmount();
  });

  test('本地浮层开着：Esc 只收浮层（newTaskDialogOpen 收起，不关整页）', () => {
    seedLive(false, false);
    uiStore.getState().openNewTask('');
    uiStore.getState().setNewTaskDialogOpen(true);
    const { calls, unmount } = mount({ localDialogOpen: true });
    pressEsc();
    expect(uiStore.getState().newTaskDialogOpen).toBe(false);
    expect(uiStore.getState().newTaskOpen).toBe(true);
    expect(calls).toEqual([]);
    unmount();
  });

  test('停止确认态：Esc 执行确认后的停止', () => {
    seedLive(false, false);
    uiStore.setState({ confirmStop: true });
    const { calls, unmount } = mount();
    pressEsc();
    expect(calls).toEqual(['stopActiveTurn']);
    expect(uiStore.getState().confirmStop).toBe(false);
    unmount();
  });

  test('流式中：Esc 停止当前轮；bash 直执行中：Esc 中止', () => {
    seedLive(true, false);
    const streaming = mount();
    pressEsc();
    expect(streaming.calls).toEqual(['stopActiveTurn']);
    streaming.unmount();

    seedLive(false, true);
    const bash = mount();
    pressEsc();
    expect(bash.calls).toEqual(['abortBash']);
    bash.unmount();
  });

  test('右侧面板开着：Esc 收面板；空闲无动作不误触', () => {
    seedLive(false, false);
    const idle = mount();
    pressEsc();
    expect(idle.calls).toEqual([]);
    idle.unmount();

    const panel = mount({ panelOpen: true });
    pressEsc();
    expect(panel.calls).toEqual(['panel']);
    panel.unmount();
  });
});
