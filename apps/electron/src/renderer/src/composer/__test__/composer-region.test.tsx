import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { ComposerRegion } from '../composer-region';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';
import type { PendingDialog } from '@/live/store';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render, renderProbe } from '@/testing/render';
import { copy } from '@/strings';
import type { ModelInfoView, PreferencesView, SessionStatsView, SessionView } from '@paiapp/contracts';

/**
 * 输入卡区域回归（T33 M2）：0 props 自订阅——数据形态/交互动作直落 store；
 * B-keystroke 双用例钉重渲半径（敲键只重渲本子树、无关线程事件零穿透）。
 * 排队卡片数据源 = hub 队列镜像（queueChanged 事件折叠）；提交 = 一行动作
 * 面 submitDraft（发送管线居主进程，T41 R1）。
 */

function model(provider: string, modelId: string): ModelInfoView {
  return { provider, modelId, reasoning: true } as ModelInfoView;
}

function session(threadId: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    threadId,
    cwd: '/tmp/t38',
    sessionPath: `/tmp/t38/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state: 'live',
    streaming: false,
    model: 'openai/gpt-5.3',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

function preferences(overrides: Partial<PreferencesView> = {}): PreferencesView {
  return {
    defaultModel: null,
    onboarded: true,
    projectModels: {},
    pinnedSessions: [],
    trustedDefault: false,
    hiddenProjects: [],
    idleRecycleMinutes: 15,
    archivedSessions: [],
    ...overrides,
  };
}

const statsOf = (total: number): SessionStatsView => ({ userMessages: 3, assistantMessages: 5, toolCalls: 7, tokens: { input: 800, output: Math.max(0, total - 800), total }, cost: 0.1 });

/** spy 首调入参（提交一行断言：文本与转换后附件恰两参，mode 缺省不显式传）。 */
function subjectCallOf(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls[0] ?? [];
}

function seedLive(input: {
  threads?: Record<string, Partial<LiveThreadState>>
  sessionOverrides?: Partial<SessionView>
  stats?: Record<string, SessionStatsView>
  models?: readonly ModelInfoView[]
  activeThreadId?: string
  dialogs?: PendingDialog[]
}): void {
  const tid = input.activeThreadId ?? 't1';
  const threads: Record<string, LiveThreadState> = {};
  for (const [id, patch] of Object.entries(input.threads ?? { [tid]: {} })) {
    threads[id] = { ...initialThreadState, ...patch };
  }
  liveStore.setState({
    sessions: { [tid]: session(tid, input.sessionOverrides) },
    activeThreadId: tid,
    threads,
    stats: input.stats ?? { [tid]: statsOf(1200) },
    models: input.models ?? [model('openai', 'gpt-5.3')],
    preferences: preferences(),
    ...(input.dialogs !== undefined ? { dialogs: input.dialogs } : {}),
  });
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

describe('待答 confirm 内联条（随发起会话走）', () => {
  test('混合会话弹窗：只渲染当前会话的确认条；无关 store 更新不触发无限重渲（getSnapshot 稳定性回归）', () => {
    seedLive({
      dialogs: [
        { requestId: 'r1', threadId: 't1', method: 'confirm', tool: 'Bash', summary: 'rm -rf /tmp/a' },
        { requestId: 'r2', threadId: 't2', method: 'confirm', tool: 'Bash', summary: 'rm -rf /tmp/b' },
      ],
    });
    const view = render(<ComposerRegion />);
    expect(view.container.textContent).toContain('需要确认');
    expect(view.container.textContent).toContain('rm -rf /tmp/a');
    expect(view.container.textContent).not.toContain('rm -rf /tmp/b'); // 其他会话的待答不进本会话输入卡
    // P1 回归判别：混合态下无关节点更新若击穿 selector 引用稳定性，act 内会以
    // Maximum update depth 崩溃（修复前实证 55 次渲染后崩）
    React.act(() => {
      liveStore.setState({ stats: { t1: statsOf(9999) } });
    });
    expect(view.container.textContent).toContain('rm -rf /tmp/a');
    view.unmount();
  });

  test('当前会话多条待答：首条 + 「还有 1 个请求等待」计数', () => {
    seedLive({
      dialogs: [
        { requestId: 'r1', threadId: 't1', method: 'confirm', tool: 'Bash', summary: 'first' },
        { requestId: 'r2', threadId: 't1', method: 'confirm', tool: 'Bash', summary: 'second' },
      ],
    });
    const view = render(<ComposerRegion />);
    expect(view.container.textContent).toContain('first');
    expect(view.container.textContent).not.toContain('second'); // 逐条应答，后续条不占位
    expect(view.container.textContent).toContain('还有 1 个请求等待');
    view.unmount();
  });
});

describe('ComposerRegion 数据形态', () => {
  test('受控回显：草稿驱动输入框值；双线程草稿隔离互不串扰', () => {
    seedLive({});
    uiStore.getState().setDraft('t1', 'T1 的草稿');
    uiStore.getState().setDraft('t2', 'T2 的草稿');
    const view = render(<ComposerRegion />);
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement;
    expect(input.value).toBe('T1 的草稿');
    liveStore.setState({ sessions: { t1: session('t1'), t2: session('t2') }, activeThreadId: 't2' });
    view.rerender(<ComposerRegion />);
    expect(input.value).toBe('T2 的草稿'); // 切线程各取各的槽
    liveStore.setState({ activeThreadId: 't1' });
    view.rerender(<ComposerRegion />);
    expect(input.value).toBe('T1 的草稿'); // 切回不丢
    view.unmount();
  });

  test('无模型（hostDown）：模型位换「宿主未连接」引导，点击进设置', () => {
    seedLive({ models: [] });
    liveStore.setState({ hostPhase: 'failed' });
    const view = render(<ComposerRegion />);
    const guide = [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('title')?.includes('宿主未连接'));
    expect(guide).toBeDefined();
    React.act(() => {
      guide?.click();
    });
    expect(uiStore.getState().settingsOpen).toBe(true);
    view.unmount();
  });

  test('用量入口：stats 已拉取为可点按钮（title=用量、显 token 合计），未拉取退化为纯展示占位', () => {
    seedLive({});
    const view = render(<ComposerRegion />);
    const usageButton = view.container.querySelector(`button[title="${copy.composer.usageSummary}"]`);
    expect(usageButton).not.toBeNull();
    expect(usageButton?.textContent).toBe('1.2k');
    view.unmount();
    seedLive({ stats: {} as Record<string, SessionStatsView> });
    const plain = render(<ComposerRegion />);
    expect(plain.container.querySelector(`button[title="${copy.composer.usageSummary}"]`)).toBeNull();
    expect(plain.container.querySelector(`span[title="${copy.composer.usageSummary}"]`)).not.toBeNull();
    plain.unmount();
  });

  test('权限模式：读口已加载渲染操作栏控件（展示名随词表），未加载不渲染', () => {
    seedLive({});
    liveStore.setState({ sessionPermissionMode: { mode: 'default', source: 'user' } });
    const withMode = render(<ComposerRegion />);
    expect(withMode.container.textContent).toContain(copy.settings.permModeOptions.auto);
    withMode.unmount();

    liveStore.setState({ sessionPermissionMode: null });
    const unloaded = render(<ComposerRegion />);
    expect(unloaded.container.textContent).not.toContain(copy.settings.permModeOptions.auto);
    unloaded.unmount();
  });
});

describe('ComposerRegion 交互', () => {
  test('停止三态接线：生成中无输入点击发送位 → stopOrAbort（直停路径）', () => {
    seedLive({ threads: { t1: { streaming: true } } });
    const stop = jest.spyOn(workspaceActions, 'stopActiveTurn');
    const view = render(<ComposerRegion />);
    const stopButton = [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '停止生成');
    expect(stopButton).toBeDefined();
    React.act(() => {
      stopButton?.click();
    });
    expect(stop).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test('排队卡片数据源 = hub 队列镜像：followUp 条目渲染卡片堆（立即/编辑/移除按 id 寻址）；队列清空即消失；空闲会话无立即位', () => {
    seedLive({
      threads: { t1: { streaming: true, queue: { steering: [], followUp: [{ id: 'q1', text: '排队的消息' }] } } },
    });
    const sendNow = jest.spyOn(workspaceActions, 'sendQueuedMessageNow');
    const edit = jest.spyOn(workspaceActions, 'editQueuedMessage');
    const remove = jest.spyOn(workspaceActions, 'removeQueuedMessage');
    const view = render(<ComposerRegion />);
    expect(view.container.textContent).toContain('排队的消息');
    // 立即改向（生成中注入当前轮）+ 编辑回填 + 移除，全部以 entryId 寻址
    expect([...view.container.querySelectorAll('button')].some((b) => b.textContent?.trim() === copy.composer.queuedSendNow)).toBe(true);
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === copy.composer.queuedEdit)?.click();
    });
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === copy.composer.queuedRemove)?.click();
    });
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.textContent?.trim() === copy.composer.queuedSendNow)?.click();
    });
    expect(edit).toHaveBeenCalledWith('t1', 'q1');
    expect(remove).toHaveBeenCalledWith('t1', 'q1');
    expect(sendNow).toHaveBeenCalledWith('t1', 'q1');
    // queueChanged 折叠清空 → 卡片随之消失（事件时差内的空态）
    React.act(() => {
      liveStore.getState().applyEvent({ type: 'queueChanged', threadId: 't1', steering: [], followUp: [] }, Date.now());
    });
    expect(view.container.textContent).not.toContain('排队的消息');
    view.unmount();
  });

  test('空闲会话的排队卡片无立即位（无运行中轮可改向）：编辑与移除仍可用', () => {
    seedLive({ threads: { t1: { streaming: false, queue: { steering: [], followUp: [{ id: 'q2', text: '空闲排队' }] } } } });
    const sendNow = jest.spyOn(workspaceActions, 'sendQueuedMessageNow');
    const view = render(<ComposerRegion />);
    expect(view.container.textContent).toContain('空闲排队');
    expect([...view.container.querySelectorAll('button')].some((b) => b.textContent?.trim() === copy.composer.queuedSendNow)).toBe(false);
    expect([...view.container.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === copy.composer.queuedRemove)).toBe(true);
    expect(sendNow).not.toHaveBeenCalled();
    view.unmount();
  });

  test('提交一行：表单提交 → 动作面 submitDraft（文本原样、回填附件经 ImagePayload 转换）；成功清草稿', async () => {
    seedLive({});
    uiStore.getState().setDraft('t1', '发出这条');
    const submit = jest.spyOn(workspaceActions, 'submitDraft').mockResolvedValue(null);
    const view = render(<ComposerRegion />);
    // 回填信号并入附件态（token 变化消费一次性信号）
    React.act(() => {
      uiStore.getState().setComposerRestore([{ name: '图.png', payload: { data: 'd', mimeType: 'image/png' } }]);
    });
    await React.act(async () => {
      view.container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(subjectCallOf(submit)).toEqual([
      '发出这条',
      [{ type: 'image', data: 'd', mediaType: 'image/png' }],
    ]);
    expect(uiStore.getState().composerDraft).toBe('');
    expect('t1' in uiStore.getState().drafts).toBe(false);
    view.unmount();
  });

  test('提交失败草稿保留（失败通知由动作面分派）：resolve 非 null 不清草稿', async () => {
    seedLive({});
    uiStore.getState().setDraft('t1', '重发这条');
    jest.spyOn(workspaceActions, 'submitDraft').mockResolvedValue('no_active_session');
    const view = render(<ComposerRegion />);
    await React.act(async () => {
      view.container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(uiStore.getState().drafts.t1).toBe('重发这条');
    view.unmount();
  });

  test('症状回归：发送卡很久时提交无反馈——在途发送位呈 loading 且禁用，连按 Enter 只投递一条；结算后恢复', async () => {
    seedLive({});
    uiStore.getState().setDraft('t1', '在途消息');
    // submitDraft 悬而不决（唤醒/受理慢）期间的可观察面：loading + 同线程在途闸
    const holder: { settle: ((reason: string | null) => void) | null } = { settle: null };
    const submit = jest.spyOn(workspaceActions, 'submitDraft').mockImplementation(
      () => new Promise<string | null>((resolve) => {
        holder.settle = resolve;
      }),
    );
    const view = render(<ComposerRegion />);
    try {
      const sendForm = (): void => {
        view.container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      };
      const sendButton = (): HTMLButtonElement | undefined =>
        [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === copy.composer.send);
      React.act(sendForm);
      expect(sendButton()?.hasAttribute('disabled')).toBe(true);
      expect(sendButton()?.querySelector('[role="status"]')).not.toBeNull();
      React.act(sendForm); // 连按 Enter：state 闭包仍为旧值，ref 闸拦截
      expect(submit).toHaveBeenCalledTimes(1);
      await React.act(async () => {
        const settle = holder.settle as ((reason: string | null) => void) | null;
        settle?.('no_active_session');
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
      });
      expect(sendButton()?.hasAttribute('disabled')).toBe(false);
      expect(sendButton()?.querySelector('[role="status"]')).toBeNull();
      React.act(sendForm); // 交界：结算后可继续提交（在途闸不残留）
      await React.act(async () => {
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
      });
      expect(submit).toHaveBeenCalledTimes(2);
    } finally {
      view.unmount();
    }
  });

  test('症状回归：切线程不被在途会话误拦——在途闸按线程键控（跨线程照发），loading 只在在途线程呈现', async () => {
    seedLive({ activeThreadId: 't1', threads: { t1: {}, t2: {} } });
    liveStore.setState({ sessions: { ...liveStore.getState().sessions, t2: session('t2') } });
    uiStore.getState().setDraft('t1', 'T1 在途');
    uiStore.getState().setDraft('t2', 'T2 提交');
    const holder: { settle: ((reason: string | null) => void) | null } = { settle: null };
    const calls: string[] = [];
    jest.spyOn(workspaceActions, 'submitDraft').mockImplementation((message) => {
      calls.push(message);
      return calls.length === 1
        ? new Promise<string | null>((resolve) => {
            holder.settle = resolve;
          })
        : Promise.resolve(null);
    });
    const view = render(<ComposerRegion />);
    try {
      const sendForm = (): void => {
        view.container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      };
      const sendButton = (): HTMLButtonElement | undefined =>
        [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === copy.composer.send);
      React.act(sendForm); // T1 在途（受理慢）
      expect(sendButton()?.querySelector('[role="status"]')).not.toBeNull();
      React.act(() => {
        liveStore.setState({ activeThreadId: 't2' });
      });
      view.rerender(<ComposerRegion />);
      // 切线程：loading 不串台，T2 发送位就绪
      expect(sendButton()?.querySelector('[role="status"]')).toBeNull();
      expect(sendButton()?.hasAttribute('disabled')).toBe(false);
      React.act(sendForm); // T2 不被 T1 在途误拦（改前互斥闸静默吞掉）
      await React.act(async () => {
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
      });
      expect(calls).toEqual(['T1 在途', 'T2 提交']);
      await React.act(async () => {
        const settle = holder.settle as ((reason: string | null) => void) | null;
        settle?.('no_active_session');
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
      });
      React.act(() => {
        liveStore.setState({ activeThreadId: 't1' });
      });
      view.rerender(<ComposerRegion />);
      expect(sendButton()?.querySelector('[role="status"]')).toBeNull(); // T1 结算后 loading 清除
    } finally {
      view.unmount();
    }
  });

  test('分支段：cwd 非空渲染项目/分支上下文条', () => {
    seedLive({});
    const view = render(<ComposerRegion />);
    expect(view.container.textContent).toContain('t38');
    view.unmount();
  });
});

describe('ComposerRegion 分支面板接线（T36）', () => {
  async function flushAsync(): Promise<void> {
    await React.act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
  }

  function branchTrigger(view: ReturnType<typeof render>): HTMLButtonElement | undefined {
    return [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === copy.composer.branchSegment);
  }

  test('空闲会话 + 仓库目录：分支段升级为锚定面板触发器（aria-expanded）；图谱钩子未开弹窗不预拉', async () => {
    seedLive({});
    jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
      ok: true,
      data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 2 },
    });
    const listGraph = jest.spyOn(workspaceActions, 'listGitGraph').mockResolvedValue({
      ok: true,
      data: { isRepo: true, commits: [], truncated: false },
    });
    const view = render(<ComposerRegion />);
    await flushAsync();
    const trigger = branchTrigger(view);
    expect(trigger).toBeDefined();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(listGraph).not.toHaveBeenCalled();
    view.unmount();
  });

  test('症状回归：面板打开即重拉分支视图——脏计数随工作区实时变化，缓存快照会过期', async () => {
    seedLive({});
    const listBranches = jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
      ok: true,
      data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 },
    });
    const view = render(<ComposerRegion />);
    await flushAsync();
    expect(listBranches).toHaveBeenCalledTimes(1); // cwd 就绪首拉
    React.act(() => {
      branchTrigger(view)?.click();
    });
    await flushAsync();
    expect(listBranches).toHaveBeenCalledTimes(2); // 打开面板刷新脏计数
    view.unmount();
  });

  test('运行中线程（streaming）：工作目录被分支切换锁锁定，分支段退回只读（无触发器）', async () => {
    seedLive({ threads: { t1: { streaming: true } } });
    jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
      ok: true,
      data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 },
    });
    const view = render(<ComposerRegion />);
    await flushAsync();
    expect(branchTrigger(view)).toBeUndefined();
    // 只读段仍展示分支名（span 而非按钮）
    expect(view.container.textContent).toContain('main');
    view.unmount();
  });

  test('非仓库目录：分支段弱化且无面板入口', async () => {
    seedLive({});
    jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
      ok: true,
      data: { isRepo: false, current: null, branches: [], dirtyFiles: 0 },
    });
    const view = render(<ComposerRegion />);
    await flushAsync();
    expect(branchTrigger(view)).toBeUndefined();
    expect(view.container.textContent).toContain(copy.composer.notARepo);
    view.unmount();
  });
});

type RegionProbeHostProps = {
  /** 渲染探针（缺省不渲染——宿主零渲染对照用例不需要）。 */
  probe?: React.FC
  onCommit: () => void
  region: React.ReactElement
};

/** B-keystroke 重渲边界回归宿主：探针在区域子树外、Profiler 包区域子树（引用恒稳定）。 */
function RegionProbeHost({ probe: Probe, onCommit, region }: RegionProbeHostProps): React.JSX.Element {
  return (
    <>
      {Probe === undefined ? null : <Probe />}
      <React.Profiler id="composer" onRender={onCommit}>
        {region}
      </React.Profiler>
    </>
  );
}

describe('重渲边界回归（B-keystroke）', () => {
  test('敲键（草稿 set）只提交 Region 子树，宿主零渲染', () => {
    seedLive({});
    let commits = 0;
    const countCommit = (): void => { commits += 1; };
    const probe = renderProbe('host');
    const region = <ComposerRegion />;
    const view = render(<RegionProbeHost probe={probe.Probe} onCommit={countCommit} region={region} />);
    commits = 0;
    probe.reset();
    React.act(() => {
      uiStore.getState().setDraft('t1', '敲键内容');
    });
    expect(commits).toBeGreaterThan(0); // 区域订阅草稿，正常更新
    expect(probe.count()).toBe(0); // B1 症状：WorkspaceMain 订阅草稿 → 全树每键重渲
    view.unmount();
  });

  test('无关线程事件零穿透：后台会话更新与后台队列折叠不重渲 Region', () => {
    seedLive({ activeThreadId: 't1' });
    let commits = 0;
    const countCommit = (): void => { commits += 1; };
    const region = <ComposerRegion />;
    const view = render(<RegionProbeHost onCommit={countCommit} region={region} />);
    commits = 0;
    // 后台线程 sessionUpdated：sessions 表换引用，但活跃条目 t1 保持原引用（真实事件流形态——
    // 后台 sessionUpdated 只替换后台条目；区域是条目级订阅，不订整表）
    const activeEntry = liveStore.getState().sessions.t1 as SessionView;
    React.act(() => {
      liveStore.setState({ sessions: { t1: activeEntry, 'bg-thread': session('bg-thread') } });
    });
    // 后台线程队列折叠（queueChanged：threads 表换引用，活跃线程条目引用不变）
    React.act(() => {
      liveStore.getState().applyEvent({ type: 'queueChanged', threadId: 'bg-thread', steering: [], followUp: [{ id: 'bg-1', text: '后台排队' }] }, Date.now());
    });
    expect(commits).toBe(0); // §1.3 预算：无关线程事件不进区域订阅面
    view.unmount();
  });
});
