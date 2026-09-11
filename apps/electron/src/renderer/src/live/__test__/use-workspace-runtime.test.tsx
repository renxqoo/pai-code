import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { useWorkspaceRuntime } from '../use-workspace-runtime';
import { singletonTab } from '@/panel/panel-state';
import { initialThreadState } from '@/live/live-thread-state';
import { controller, store as liveStore } from '@/live/workspace-runtime';
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
  jest.restoreAllMocks();
});

describe('useWorkspaceRuntime 切会话 effect', () => {
  test('激活链：ensureHydrated/readSessionRules 随切会话派发（冷启动水化不断链）+ parked 档位本地推导', () => {
    const hydrate = jest.spyOn(controller, 'ensureHydrated');
    const readRules = jest.spyOn(controller, 'readSessionRules');
    liveStore.setState({ models: models() });
    const view = render(<RuntimeHarness />);
    liveStore.setState({
      sessions: { t1: session('t1', 'parked') },
      activeThreadId: 't1',
      threads: { t1: initialThreadState },
    });
    view.rerender(<RuntimeHarness />);
    expect(liveStore.getState().effortLevels.length).toBeGreaterThan(1); // reasoning 模型多档（词表在 contracts）
    expect(hydrate).toHaveBeenCalledWith('t1');
    expect(readRules).toHaveBeenCalledWith('t1');
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

  test('症状：同线程 live→parked 翻转后 commands 清空（parked worker 的斜杠目录不残留）', () => {
    liveStore.setState({ models: models() });
    liveStore.setState({
      sessions: { t1: session('t1', 'live') },
      activeThreadId: 't1',
      threads: { t1: initialThreadState },
    });
    const view = render(<RuntimeHarness />);
    view.rerender(<RuntimeHarness />);
    // 模拟 live 期 command/list 落库
    React.act(() => {
      liveStore.setState({ commands: [{ name: 'compact', description: null, source: 'builtin' as const }] });
    });
    // 闲置回收：同 id 翻转 live→parked → effect 依赖 activeSessionState 重跑
    React.act(() => {
      liveStore.getState().applyEvent({ type: 'sessionParked', threadId: 't1', reason: 'idle' }, Date.now());
    });
    expect(liveStore.getState().sessions.t1?.state).toBe('parked');
    // effect 重跑证明（parked 分支本地推导 effortLevels），commands 随翻转清空
    expect(liveStore.getState().effortLevels.length).toBeGreaterThan(0);
    expect(liveStore.getState().commands).toEqual([]);
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
