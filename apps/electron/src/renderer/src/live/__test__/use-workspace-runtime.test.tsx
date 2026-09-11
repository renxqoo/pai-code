import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { useWorkspaceRuntime } from '../use-workspace-runtime';
import { singletonTab } from '@/panel/panel-state';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import type { ModelInfoView, SessionView } from '@paiapp/contracts';

/**
 * 工作区运行挂载回归（T34 M3）：切会话 effect（parked 本地档位推导 / live 离线桥
 * 不写）与面板组态会话级存档/恢复（M2 挂账的关键回归——切走存档、切回恢复）。
 * controller 生命周期（start/dispose）不在单测面（桥 unavailable 时幂等）。
 */

function session(threadId: string, state: 'live' | 'parked', model: string | null = 'openai/gpt'): SessionView {
  return {
    threadId,
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state,
    streaming: false,
    model,
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
}

function models(): ModelInfoView[] {
  return [{ provider: 'openai', modelId: 'gpt', reasoning: true } as ModelInfoView];
}

function RuntimeHarness(): React.JSX.Element {
  useWorkspaceRuntime();
  return <span data-testid="runtime" />;
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

describe('useWorkspaceRuntime 切会话 effect', () => {
  test('parked 会话激活：思考档按模型能力本地推导写入 store', () => {
    liveStore.setState({ models: models() });
    const view = render(<RuntimeHarness />);
    liveStore.setState({
      sessions: { t1: session('t1', 'parked') },
      activeThreadId: 't1',
      threads: { t1: initialThreadState },
    });
    view.rerender(<RuntimeHarness />);
    expect(liveStore.getState().effortLevels.length).toBeGreaterThan(1); // reasoning 模型多档（词表在 contracts）
    view.unmount();
  });

  test('live 会话激活：离线桥下档位拉取失败不写（保持清空态）', () => {
    liveStore.setState({ models: models() });
    const view = render(<RuntimeHarness />);
    liveStore.setState({
      sessions: { t1: session('t1', 'live') },
      activeThreadId: 't1',
      threads: { t1: initialThreadState },
    });
    view.rerender(<RuntimeHarness />);
    expect(liveStore.getState().effortLevels).toEqual([]);
    view.unmount();
  });
});

describe('面板组态会话级存档/恢复', () => {
  test('t1 开 agents 面板 → 切 t2 空 → 切回 t1 恢复', () => {
    liveStore.setState({
      sessions: { t1: session('t1', 'live'), t2: session('t2', 'live') },
      activeThreadId: 't1',
      threads: { t1: initialThreadState, t2: initialThreadState },
    });
    const view = render(<RuntimeHarness />);
    React.act(() => {
      uiStore.getState().openAgentsPane();
    });
    view.rerender(<RuntimeHarness />);
    expect(uiStore.getState().panel.tabs[0]).toMatchObject(singletonTab('agents'));
    // 切到 t2：存档 t1、t2 空面板
    liveStore.setState({ activeThreadId: 't2' });
    view.rerender(<RuntimeHarness />);
    expect(uiStore.getState().panel.tabs).toHaveLength(0);
    // 切回 t1：恢复 agents
    liveStore.setState({ activeThreadId: 't1' });
    view.rerender(<RuntimeHarness />);
    expect(uiStore.getState().panel.tabs[0]).toMatchObject(singletonTab('agents'));
    view.unmount();
  });
});
