import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { SessionView, TodoSnapshotEventData } from '@paiapp/contracts';

import { PulsePanel } from '../pulse-panel';
import { render } from '@/testing/render';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import type { SubagentModel } from '@/thread/thread-model';
import { uiStore } from '@/ui/ui-store';

/**
 * 速览面板旅程（T44，跨层集成）：live 事件/水化 → store 折叠 → 面板 DOM。
 * 覆盖：todo 快照 last-wins 进程区、智能体区与运行条出没、收起 chip 三段聚合、
 * 无会话不摆面板。git 区数据面走 git/status 读口（本装置无宿主——失败态呈现
 * 即断言），真机走查覆盖真实读口。
 */

function session(threadId: string, cwd: string): SessionView {
  return { threadId, cwd, sessionPath: null, title: 'T', state: 'live', streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 };
}

function agent(id: string, status: SubagentModel['status'], taskText: string): SubagentModel {
  return {
    id,
    agentId: id,
    name: id,
    agentType: 'explore',
    task: taskText,
    model: '',
    effort: '',
    tokens: null,
    toolCount: 0,
    status,
    startedAt: 1_000,
    endedAt: status === 'running' ? null : 2_000,
    summary: '',
    pendingAsk: null,
    tools: [],
  };
}

function threadState(overrides: Partial<LiveThreadState>): LiveThreadState {
  return { ...initialThreadState, hydrated: true, ...overrides };
}

const snapshot: TodoSnapshotEventData = {
  seq: 1,
  tasks: [
    { id: '1', subject: '批次 A', status: 'completed' },
    { id: '2', subject: '批次 B', status: 'in_progress', description: '收窄', owner: 'worker-2' },
    { id: '3', subject: '批次 C', status: 'pending' },
  ],
  edges: [],
};

function seed(thread: LiveThreadState): void {
  liveStore.setState({
    activeThreadId: 't1',
    sessions: { t1: session('t1', '/tmp/pulse-journey') },
    threads: { t1: thread },
  });
  uiStore.setState({ pulse: { open: true, sections: { todo: true, agents: true } } });
}

describe('速览面板旅程', () => {
  test('todo 快照 last-wins → 进程区 n/m + 三态行；智能体区 + 运行条随运行态出没', () => {
    seed(threadState({ todo: snapshot, agents: [agent('a', 'running', '装置加装'), agent('b', 'stopped', '实现组件')] }));
    const page = render(<PulsePanel />);
    const text = page.container.textContent ?? '';
    expect(text).toContain('速览');
    expect(text).toContain('进程');
    expect(text).toContain('1/3');
    expect(text).toContain('批次 A');
    expect(text).toContain('worker-2');
    expect(text).toContain('智能体');
    expect(text).toContain('1 工作中');
    expect(text).toContain('装置加装');
    // 底部运行条（运行中才出；计数在无障碍名）
    expect(page.container.querySelector('[aria-label="1 个子智能体运行中，打开 Agents 面板"]')).not.toBeNull();
    page.unmount();

    // 事件折叠 last-wins：新快照整体替换（全完成态）
    seed(threadState({ todo: snapshot, agents: [agent('a', 'stopped', '装置加装')] }));
    const page2 = render(<PulsePanel />);
    React.act(() => {
      liveStore.getState().applyEvent(
        { type: 'todoSnapshot', threadId: 't1', snapshot: { seq: 2, tasks: [{ id: '1', subject: '批次 A', status: 'completed' }], edges: [] } },
        Date.now(),
      );
    });
    const text2 = page2.container.textContent ?? '';
    expect(text2).toContain('1/1');
    expect(text2).not.toContain('批次 B');
    // 无运行中：运行条消失
    expect(page2.container.querySelector('[aria-label="1 个子智能体运行中，打开 Agents 面板"]')).toBeNull();
    page2.unmount();
  });

  test('收起态 chip：三段聚合（更改段缺位不显、进程/运行段在）', () => {
    seed(threadState({ todo: snapshot, agents: [agent('a', 'running', 't')] }));
    uiStore.getState().setPulseOpen(false);
    const page = render(<PulsePanel />);
    const text = page.container.textContent ?? '';
    expect(text).toContain('速览');
    expect(text).toContain('1/3');
    expect(text).toContain('1 工作中');
    expect(text).not.toContain('更改');
    // 运行胶囊（收起态的运行状态载体）随运行态在场
    expect(page.container.querySelector('[aria-label="1 个子智能体运行中，打开 Agents 面板"]')).not.toBeNull();
    page.unmount();
  });

  test('空数据面：面板只剩标题栏（无假控件）；无会话不摆面板', () => {
    seed(threadState({}));
    const page = render(<PulsePanel />);
    const text = page.container.textContent ?? '';
    expect(text).toContain('速览');
    expect(text).not.toContain('进程');
    expect(text).not.toContain('智能体');
    page.unmount();

    liveStore.setState({ activeThreadId: null, sessions: {}, threads: {} });
    const empty = render(<PulsePanel />);
    expect(empty.container.textContent ?? '').toBe('');
    empty.unmount();
  });
});
