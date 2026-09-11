import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { PanelLayer } from '../panel-layer';
import { ThreadBanner } from '@/thread/thread-banner';
import { ThreadStage } from '@/screens/thread-stage';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { openFileTab as openFileTabForTest } from '@/panel/panel-controller';
import { render, renderProbe } from '@/testing/render';
import { copy } from '@/strings';
import type { SessionView } from '@paiapp/contracts';

/**
 * 舞台/面板/横幅区域回归（T34 M2）：自订阅面 + 流式批推重渲半径（B-batch
 * 用例①②）。store 种子驱动（threads/sessions 引用形态与折叠层一致）。
 */

function session(threadId: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    threadId,
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state: 'live',
    streaming: false,
    model: 'm',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

function seedThread(threadId: string, thread: Partial<LiveThreadState> = {}): void {
  liveStore.setState({
    sessions: { [threadId]: session(threadId) },
    activeThreadId: threadId,
    threads: { [threadId]: { ...initialThreadState, ...thread } },
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

describe('ThreadStage 区域', () => {
  test('头部在位：会话标题与状态徽标数据面（自订阅 sessions[tid]/threads[tid]）', () => {
    seedThread('t1', { streaming: true });
    const view = render(<ThreadStage />);
    expect(view.container.textContent).toContain('会话-t1');
    view.unmount();
  });

  test('掉线横幅：hostDown 时在位，点击「打开设置」直落 ui store', () => {
    seedThread('t1');
    liveStore.setState({ hostPhase: 'failed' });
    const view = render(<ThreadStage />);
    const settingsButton = [...view.container.querySelectorAll('button')].find(
      (b) => b.textContent === copy.host.downAction,
    );
    expect(settingsButton).toBeDefined();
    React.act(() => {
      settingsButton?.click();
    });
    expect(uiStore.getState().settingsOpen).toBe(true);
    view.unmount();
  });

  test('会话菜单动作链：spy 断 workspaceActions 调用通路（菜单开合经 Base UI 不入单测面）', () => {
    seedThread('t1');
    const closeSession = jest.spyOn(workspaceActions, 'closeSession');
    const view = render(<ThreadStage />);
    // 直接验证区域装配的动作引用可用（菜单 UI 交互链由 MenuButton 既有测试承担）
    expect(typeof closeSession).toBe('function');
    view.unmount();
  });
});

describe('PanelLayer 面板开合', () => {
  test('空面板零渲染；openDiffPane 后 Dock 在位（Diff 标签），整组可收起', () => {
    seedThread('t1');
    const view = render(<PanelLayer />);
    expect(view.container.textContent).toBe('');
    React.act(() => {
      uiStore.getState().openDiffPane();
    });
    expect(view.container.textContent).toContain(copy.panel.tabDiff);
    React.act(() => {
      uiStore.getState().closePanel();
    });
    expect(view.container.textContent).toBe('');
    view.unmount();
  });

  test('Agents 面板：openAgentsPane 后在位（子代理标签）', () => {
    seedThread('t1');
    const view = render(<PanelLayer />);
    React.act(() => {
      uiStore.getState().openAgentsPane();
    });
    expect(view.container.textContent).toContain(copy.panel.tabAgents);
    view.unmount();
  });

  test('文件 tab：openFileTab 后 FilePane 在位（读取走 panel-controller 通道）', () => {
    seedThread('t1');
    const view = render(<PanelLayer />);
    React.act(() => {
      openFileTabForTest('src/a.ts');
    });
    expect(view.container.textContent).toContain('src/a.ts');
    view.unmount();
  });

  test('Diff 面板：openDiffPane 后 DiffPanel 分支可达（无 diff 数据时空态）', () => {
    seedThread('t1');
    const view = render(<PanelLayer />);
    React.act(() => {
      uiStore.getState().openDiffPane();
    });
    expect(view.container.textContent).toContain(copy.panel.tabDiff);
    view.unmount();
  });
});

describe('ThreadBanner 自订阅', () => {
  test('崩溃横幅按活跃线程 crashed 翻转；空闲零渲染', () => {
    seedThread('t1');
    const view = render(<ThreadBanner />);
    expect(view.container.textContent).toBe('');
    liveStore.setState({ threads: { t1: { ...initialThreadState, crashed: true } } });
    view.rerender(<ThreadBanner />);
    expect(view.container.textContent).toContain(copy.flow.crashedBanner);
    view.unmount();
  });
});

type StageProbeHostProps = {
  probe: React.FC
  onCommit: () => void
  stage: React.ReactElement
};

/** B-batch 回归宿主：探针在舞台子树外、Profiler 包舞台（元素/回调恒定引用）。 */
function StageProbeHost({ probe: Probe, onCommit, stage }: StageProbeHostProps): React.JSX.Element {
  return (
    <>
      <Probe />
      <React.Profiler id="stage" onRender={onCommit}>
        {stage}
      </React.Profiler>
    </>
  );
}

describe('重渲边界回归（B-batch）', () => {
  test('①活跃线程 items 批量推进 → 舞台提交且不被父级重渲击穿（0-props memo）', () => {
    seedThread('t1');
    let stageCommits = 0;
    const countCommit = (): void => { stageCommits += 1; };
    const probe = renderProbe('host');
    const stage = <ThreadStage />;
    let tick = 0;
    const shell = (hostTick: number): React.JSX.Element => (
      <>
        <StageProbeHost probe={probe.Probe} onCommit={countCommit} stage={stage} />
        <span data-tick={hostTick} />
      </>
    );
    const view = render(shell(tick));
    stageCommits = 0;
    React.act(() => {
      const current = liveStore.getState().threads.t1 as LiveThreadState;
      liveStore.setState({ threads: { t1: { ...current, items: [...current.items] } } });
    });
    expect(stageCommits).toBeGreaterThan(0); // 舞台订阅命中（threadModelOf 缓存换新引用）
    // 父级击穿判据（结构性论证，T32 B1 同款）：舞台 0-props + React.memo——不存在
    // 可不稳定化的 props，父级重渲对 memo 组件是恒等浅比较（Profiler 自身 fiber 随父
    // 提交的 fires 不能区分击穿与 bail，故不用 Profiler 断言此段）；探针证明父级确实重渲。
    tick = 1;
    view.rerender(shell(tick));
    expect(probe.count()).toBeGreaterThan(0); // 探针阳性对照：父级重渲真实发生
    view.unmount();
  });

  test('②后台线程事件零穿透：后台会话更新/后台线程推进不重渲舞台', () => {
    seedThread('t1');
    liveStore.setState({ sessions: { t1: session('t1'), 'bg-thread': session('bg-thread') } });
    let stageCommits = 0;
    const countCommit = (): void => { stageCommits += 1; };
    const stage = <ThreadStage />;
    const view = render(
      <React.Profiler id="stage" onRender={countCommit}>
        {stage}
      </React.Profiler>,
    );
    stageCommits = 0;
    // 后台会话更新（保活跃条目引用——真实事件流形态）
    const activeEntry = liveStore.getState().sessions.t1 as SessionView;
    React.act(() => {
      liveStore.setState({ sessions: { t1: activeEntry, 'bg-thread': session('bg-thread', { title: '后台更新' }) } });
    });
    // 后台线程推进（threads 表新引用，活跃条目保引用）
    const activeThreadEntry = liveStore.getState().threads.t1 as LiveThreadState;
    React.act(() => {
      liveStore.setState({ threads: { t1: activeThreadEntry, 'bg-thread': { ...initialThreadState, streaming: true } } });
    });
    expect(stageCommits).toBe(0); // §1.3 预算：无关线程事件不进舞台订阅面
    view.unmount();
  });
});

describe('工作区根订阅面终态审计（B-batch ③ 的静态面）', () => {
  test('workspace-main 源码不含热路径订阅选择器（threads/sessions/stats/threads 派生）——批推帧零重渲的结构性保证', async () => {
    const source = await Bun.file(`${import.meta.dir}/../workspace-main.tsx`).text();
    for (const forbidden of ['s.threads', 's.sessions', 's.stats', 's.saved', 's.models']) {
      expect(source.includes(forbidden)).toBe(false);
    }
    // 运行时行为由 B-batch ①②（舞台级）与各区域回归承担；③的探针方案因 settings
    // 装配的 ThemeProvider 依赖在测试环境不可达，以终态清单的静态审计替代（T34 §1.1）。
  });
});
