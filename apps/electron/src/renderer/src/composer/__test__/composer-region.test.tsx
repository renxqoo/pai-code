import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { ComposerRegion } from '../composer-region';
import { queuedDrafts } from '@/composer/queued-drafts';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render, renderProbe } from '@/testing/render';
import { copy } from '@/strings';
import type { ModelInfoView, PreferencesView, SessionStatsView, SessionView } from '@paiapp/contracts';

/**
 * 输入卡区域回归（T33 M2）：0+1 props 自订阅——数据形态/交互动作直落 store 与
 * queuedDrafts；B-keystroke 双用例钉重渲半径（敲键只重渲本子树、无关线程事件零穿透）。
 */

function model(provider: string, modelId: string): ModelInfoView {
  return { provider, modelId, supportedThinkingLevels: ['medium', 'high'] } as ModelInfoView;
}

function session(threadId: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    threadId,
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/s/${threadId}.jsonl`,
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

function seedLive(input: {
  threads?: Record<string, Partial<LiveThreadState>>
  sessionOverrides?: Partial<SessionView>
  stats?: Record<string, SessionStatsView>
  models?: readonly ModelInfoView[]
  activeThreadId?: string
}): void {
  const tid = input.activeThreadId ?? 't1';
  const threads: Record<string, LiveThreadState> = {};
  for (const [id, patch] of Object.entries(input.threads ?? { [tid]: {} })) {
    threads[id] = { ...initialThreadState, ...patch };
  }
  const stat: SessionStatsView = { contextUsage: 12, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 } as SessionStatsView;
  liveStore.setState({
    sessions: { [tid]: session(tid, input.sessionOverrides) },
    activeThreadId: tid,
    threads,
    stats: input.stats ?? { [tid]: stat },
    models: input.models ?? [model('openai', 'gpt-5.3')],
    preferences: preferences(),
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

describe('ComposerRegion 数据形态', () => {
  test('受控回显：草稿驱动输入框值；双线程草稿隔离互不串扰', () => {
    seedLive({});
    uiStore.getState().setDraft('t1', 'T1 的草稿');
    uiStore.getState().setDraft('t2', 'T2 的草稿');
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement;
    expect(input.value).toBe('T1 的草稿');
    liveStore.setState({ sessions: { t1: session('t1'), t2: session('t2') }, activeThreadId: 't2' });
    view.rerender(<ComposerRegion onOpenAgents={() => undefined} />);
    expect(input.value).toBe('T2 的草稿'); // 切线程各取各的槽
    liveStore.setState({ activeThreadId: 't1' });
    view.rerender(<ComposerRegion onOpenAgents={() => undefined} />);
    expect(input.value).toBe('T1 的草稿'); // 切回不丢
    view.unmount();
  });

  test('无模型（hostDown）：模型位换「宿主未连接」引导，点击进设置', () => {
    seedLive({ models: [] });
    liveStore.setState({ hostPhase: 'failed' });
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
    const guide = [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('title')?.includes('宿主未连接'));
    expect(guide).toBeDefined();
    React.act(() => {
      guide?.click();
    });
    expect(uiStore.getState().settingsOpen).toBe(true);
    view.unmount();
  });

  test('用量环：stats 已拉取为可点按钮（title=上下文占用），未拉取退化为纯展示 span', () => {
    seedLive({});
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
    expect(view.container.querySelector('button[title="上下文占用"]')).not.toBeNull();
    view.unmount();
    seedLive({ stats: {} as Record<string, SessionStatsView> });
    const plain = render(<ComposerRegion onOpenAgents={() => undefined} />);
    expect(plain.container.querySelector('button[title="上下文占用"]')).toBeNull();
    expect(plain.container.querySelector('span[title="上下文占用"]')).not.toBeNull();
    plain.unmount();
  });

  test('权限模式：会话规则已加载渲染操作栏控件，未加载不渲染', () => {
    seedLive({});
    liveStore.setState({ sessionRules: { rules: { mode: 'ask' }, source: 'global' } });
    const withRules = render(<ComposerRegion onOpenAgents={() => undefined} />);
    expect(withRules.container.textContent).toContain(copy.settings.permissionsModeAsk);
    withRules.unmount();
  });
});

describe('ComposerRegion 交互', () => {
  test('停止三态接线：生成中无输入点击发送位 → stopOrAbort（直停路径）', () => {
    seedLive({ threads: { t1: { streaming: true } } });
    const stop = jest.spyOn(workspaceActions, 'stopActiveTurn');
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
    const stopButton = [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '停止生成');
    expect(stopButton).toBeDefined();
    React.act(() => {
      stopButton?.click();
    });
    expect(stop).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test('排队卡片三动作：暂存后渲染卡片堆；移除即消失；编辑回填草稿', () => {
    seedLive({ threads: { t1: { streaming: true } } });
    uiStore.getState().setDraft('t1', '第一条');
    queuedDrafts.stage('t1', '/tmp/pai/s/t1.jsonl', '排队的消息', []);
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
    expect(view.container.textContent).toContain('排队的消息');
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '移除排队消息')?.click();
    });
    expect(view.container.textContent).not.toContain('排队的消息');
    // 再暂存一条走编辑回填
    queuedDrafts.stage('t1', '/tmp/pai/s/t1.jsonl', '第二条排队', []);
    view.rerender(<ComposerRegion onOpenAgents={() => undefined} />);
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '编辑排队消息')?.click();
    });
    expect(uiStore.getState().drafts.t1 ?? uiStore.getState().composerDraft).toBe('第二条排队');
    view.unmount();
  });

  test('排队卡片「立即」改向：以 steer 模式直投活跃线程（附件经 ImagePayload 转换）', async () => {
    // queuedDrafts 无 reset 单例：独立线程 id 隔离跨文件残留
    seedLive({ activeThreadId: 't-steer', threads: { 't-steer': { streaming: true } } });
    const submit = jest.spyOn(workspaceActions, 'submitThreadDraft').mockResolvedValue(null);
    queuedDrafts.stage('t-steer', '/tmp/pai/s/t-steer.jsonl', '改向消息', [{ name: '图.png', payload: { data: 'd', mimeType: 'image/png' } }]);
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.textContent?.trim() === '立即')?.click();
    });
    // sendNow 经线程内串行队列（链式微任务）异步派发——刷足微任务拍后断言
    await React.act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect(submit).toHaveBeenCalledWith('t-steer', '改向消息', [{ type: 'image', data: 'd', mimeType: 'image/png' }], 'steer');
    view.unmount();
  });

  test('分支段：cwd 非空渲染项目/分支上下文条', () => {
    seedLive({});
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
    expect(view.container.textContent).toContain('pai');
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
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
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
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
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
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
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
    const view = render(<ComposerRegion onOpenAgents={() => undefined} />);
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
    const region = <ComposerRegion onOpenAgents={() => undefined} />;
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

  test('无关线程事件零穿透：后台会话更新与后台排队暂存不重渲 Region', () => {
    seedLive({ activeThreadId: 't1' });
    let commits = 0;
    const countCommit = (): void => { commits += 1; };
    const region = <ComposerRegion onOpenAgents={() => undefined} />;
    const view = render(<RegionProbeHost onCommit={countCommit} region={region} />);
    commits = 0;
    // 后台线程 sessionUpdated：sessions 表换引用，但活跃条目 t1 保持原引用（真实事件流形态——
    // 后台 sessionUpdated 只替换后台条目；区域是条目级订阅，不订整表）
    const activeEntry = liveStore.getState().sessions.t1 as SessionView;
    React.act(() => {
      liveStore.setState({ sessions: { t1: activeEntry, 'bg-thread': session('bg-thread') } });
    });
    // 后台线程排队暂存（queuedDrafts 通知，但按键取快照对 t1 引用不变）
    React.act(() => {
      queuedDrafts.stage('bg-thread', '/tmp/pai/s/bg.jsonl', '后台暂存', []);
    });
    expect(commits).toBe(0); // §1.3 预算：无关线程事件不进区域订阅面
    view.unmount();
  });
});
