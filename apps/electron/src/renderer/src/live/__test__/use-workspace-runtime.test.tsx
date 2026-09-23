import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { useWorkspaceRuntime } from '../use-workspace-runtime';
import { singletonTab } from '@/panel/panel-state';
import { initialThreadState } from '@/live/live-thread-state';
import { bridgeClient, controller, store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import type { AgentDefinition, ModelInfoView, SessionView } from '@paiapp/contracts';

/**
 * 工作区运行挂载回归（T34 M3）：切会话 effect（parked 读不唤醒 / live 离线桥
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
  test('激活链：ensureHydrated 随切会话派发（冷启动水化不断链）；parked 不发 worker 级读口（读不唤醒）', () => {
    const hydrate = jest.spyOn(controller, 'ensureHydrated');
    const readMode = jest.spyOn(controller, 'readSessionPermissionMode');
    const readThinking = jest.spyOn(controller, 'readThinkingLevel');
    liveStore.setState({ models: models() });
    const view = render(<RuntimeHarness />);
    React.act(() => {
      liveStore.setState({
        sessions: { t1: session('t1', 'parked') },
        activeThreadId: 't1',
        threads: { t1: initialThreadState },
      });
    });
    view.rerender(<RuntimeHarness />);
    expect(hydrate).toHaveBeenCalledWith('t1');
    expect(readMode).not.toHaveBeenCalled();
    expect(readThinking).not.toHaveBeenCalled();
    view.unmount();
  });

  test('live 会话激活：离线桥下权限模式/思考档/命令目录拉取失败不写（保持清空态）', () => {
    liveStore.setState({ models: models() });
    const view = render(<RuntimeHarness />);
    React.act(() => {
      liveStore.setState({
        sessions: { t1: session('t1', 'live') },
        activeThreadId: 't1',
        threads: { t1: initialThreadState },
      });
    });
    view.rerender(<RuntimeHarness />);
    expect(liveStore.getState().thinkingLevel).toBe(null);
    expect(liveStore.getState().sessionPermissionMode).toBe(null);
    expect(liveStore.getState().commands).toEqual([]);
    view.unmount();
  });

  test('症状：同线程 live→parked 翻转后 commands 保留（闲置回收不得让 `/` 触发静默失效）', () => {
    liveStore.setState({ models: models() });
    React.act(() => {
      liveStore.setState({
        sessions: { t1: session('t1', 'live') },
        activeThreadId: 't1',
        threads: { t1: initialThreadState },
      });
    });
    const view = render(<RuntimeHarness />);
    view.rerender(<RuntimeHarness />);
    // 模拟 live 期 command/list 落库
    React.act(() => {
      liveStore.setState({ commands: [{ name: 'compact', description: null, source: 'command' as const }] });
    });
    // 闲置回收：同 id 翻转 live→parked → effect 依赖 activeSessionState 重跑
    React.act(() => {
      liveStore.getState().applyEvent({ type: 'sessionParked', threadId: 't1', reason: 'idle' }, Date.now());
    });
    expect(liveStore.getState().sessions.t1?.state).toBe('parked');
    // parked 分支不发 worker 级读口（防唤醒），但目录保留最近一次成功快照——
    // 清空会让 `/` 补全在闲置回收后永久失效（parked 不重拉）
    expect(liveStore.getState().commands).toHaveLength(1);
    view.unmount();
  });

  test('同线程 parked↔live 翻转不属切会话：agentDefinitions 不随翻转清空（闲置回收不清已加载定义）', () => {
    const agent: AgentDefinition = {
      name: 'builder',
      description: '构建值守',
      systemPrompt: '',
      tools: null,
      model: null,
      scope: 'user',
      project: null,
    };
    liveStore.setState({ models: models() });
    liveStore.setState({
      sessions: { t1: session('t1', 'live') },
      activeThreadId: 't1',
      threads: { t1: initialThreadState },
    });
    const view = render(<RuntimeHarness />);
    React.act(() => {
      liveStore.setState({ agentDefinitions: [agent] });
    });
    React.act(() => {
      liveStore.getState().applyEvent({ type: 'sessionParked', threadId: 't1', reason: 'idle' }, Date.now());
    });
    expect(liveStore.getState().agentDefinitions).toEqual([agent]);
    view.unmount();
  });

  test('症状：首页（无会话）输入框 `/` 无命令窗口——预会话目录随挂载供数（command/preview）', async () => {
    const invoke = jest
      .spyOn(bridgeClient, 'invoke')
      .mockImplementation(((method: string) =>
        Promise.resolve(
          method === 'command/preview'
            ? { ok: true, data: [{ name: 'skill:bw', description: null, source: 'skill' }] }
            : { ok: false, error: { kind: 'transient', face: 'bridge_unavailable' } },
        )) as never);
    const view = render(<RuntimeHarness />);
    await React.act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    // 无会话（activeThreadId=null）时命令目录唯一来源是预会话目录——不拉 = commands
    // 恒空 = prompt-input-area 的 commands.length 门闩停用 `/` 触发（placeholder 宣传了它）
    expect(invoke.mock.calls.map((call) => call[0])).toContain('command/preview');
    expect(liveStore.getState().commands.map((command) => command.name)).toEqual(['skill:bw']);
    view.unmount();
  });

  test('live 会话激活拉 command/list；会话切换后过期应答不回写（判活守卫）', async () => {
    const invoke = jest
      .spyOn(bridgeClient, 'invoke')
      .mockImplementation(((method: string) =>
        Promise.resolve(
          method === 'command/list'
            ? { ok: true, data: [{ name: 'compact', description: null, source: 'command' }] }
            : { ok: false, error: { kind: 'transient', face: 'bridge_unavailable' } },
        )) as never);
    liveStore.setState({ models: models() });
    const view = render(<RuntimeHarness />);
    React.act(() => {
      liveStore.setState({
        sessions: { t1: session('t1', 'live') },
        activeThreadId: 't1',
        threads: { t1: initialThreadState },
      });
    });
    await React.act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(invoke.mock.calls.map((call) => call[0])).toContain('command/list');
    expect(liveStore.getState().commands.map((command) => command.name)).toEqual(['compact']);
    view.unmount();
  });
});

describe('面板组态会话级存档/恢复', () => {
  test('t1 开 agents 面板 → 切 t2 空 → 切回 t1 恢复', () => {
    React.act(() => {
      liveStore.setState({
        sessions: { t1: session('t1', 'live'), t2: session('t2', 'live') },
        activeThreadId: 't1',
        threads: { t1: initialThreadState, t2: initialThreadState },
      });
    });
    const view = render(<RuntimeHarness />);
    React.act(() => {
      uiStore.getState().openAgentsPane();
    });
    view.rerender(<RuntimeHarness />);
    expect(uiStore.getState().panel.tabs[0]).toMatchObject(singletonTab('agents'));
    // 切到 t2：存档 t1、t2 空面板
    React.act(() => {
      liveStore.setState({ activeThreadId: 't2' });
    });
    view.rerender(<RuntimeHarness />);
    expect(uiStore.getState().panel.tabs).toHaveLength(0);
    // 切回 t1：恢复 agents
    React.act(() => {
      liveStore.setState({ activeThreadId: 't1' });
    });
    view.rerender(<RuntimeHarness />);
    expect(uiStore.getState().panel.tabs[0]).toMatchObject(singletonTab('agents'));
    view.unmount();
  });
});
