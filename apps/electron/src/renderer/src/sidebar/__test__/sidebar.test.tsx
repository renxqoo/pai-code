import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PreferencesView, SessionView } from '@paiapp/contracts';

import { Sidebar } from '../sidebar';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render, renderProbe } from '@/testing/render';

/**
 * 侧栏区域自订阅回归（T32 M2）：壳 0 props——SSR 只见初始 store 态（冒烟），
 * 数据形态与交互经客户端渲染 + 模块 store 种子驱动；
 * B1/B2 重渲边界（内联对象击穿 memo / ages tick 全树重渲）用 Profiler/探针钉住。
 */

function makeSession(id: string, overrides: Partial<SessionView> = {}): SessionView {
  return {
    threadId: id,
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/sessions/${id}.jsonl`,
    title: `会话-${id}`,
    state: 'live',
    streaming: false,
    model: 'openai/gpt-5.3',
    thinkingLevel: null,
    lastActivityAt: Date.now() - 60_000,
    ...overrides,
  };
}

function makePreferences(overrides: Partial<PreferencesView> = {}): PreferencesView {
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

function seedLive(sessions: Record<string, SessionView>, activeThreadId: string | null = null, preferences = makePreferences()): void {
  liveStore.setState({ sessions, activeThreadId, preferences });
}

type CommitProbeHostProps = {
  /** 渲染探针（非 memo，忠实随宿主重渲——阳性对照用）。 */
  probe: React.FC
  /** Profiler 提交回调（引用须稳定，否则 Profiler 自身随父级提交）。 */
  onCommit: () => void
  sidebar: React.ReactElement
  /** 重渲变量（阳性对照：宿主自身确实会重渲）。 */
  tick?: number
};

/** B1/B2 重渲边界回归的宿主：探针在侧栏子树外、Profiler 包侧栏子树。 */
function CommitProbeHost({ probe: Probe, onCommit, sidebar, tick = 0 }: CommitProbeHostProps): React.JSX.Element {
  return (
    <>
      <Probe />
      <React.Profiler id="sidebar" onRender={onCommit}>
        {sidebar}
      </React.Profiler>
      <span data-tick={tick} />
    </>
  );
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
  jest.useRealTimers();
});

describe('Sidebar 壳（SSR 初始态冒烟）', () => {
  test('快捷操作/视图切换/底部工具条在位；死入口（插件市场/工作流/占位钮）已按 U1 删除', () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain('新建任务');
    expect(html).toContain('搜索');
    expect(html).toContain('自动化');
    expect(html).toContain('分组');
    expect(html).toContain('项目');
    expect(html).toContain('收起侧栏');
    expect(html).toContain('设置');
    expect(html).toContain('用量');
    expect(html).toContain('刷新会话');
    expect(html).not.toContain('插件市场');
    expect(html).not.toContain('工作流');
    expect(html).not.toContain('lucide-trash');
  });

  test('零会话初始态：引导文案带 ⌘N/Ctrl+N 快捷键徽标', () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain('暂无任务');
    expect(html).toMatch(/(⌘\+N|Ctrl\+N)/);
    expect(html).toMatch(/(⌘\+K|Ctrl\+K)/); // 搜索行快捷键徽标
  });
});

describe('Sidebar 列表区域（客户端渲染）', () => {
  test('分组视图：平铺会话行渲染标题，活跃行带 data-active', () => {
    seedLive({ a: makeSession('a'), b: makeSession('b', { title: '修复排队消息' }) }, 'a');
    const view = render(<Sidebar />);
    expect(view.container.textContent).toContain('会话-a');
    expect(view.container.textContent).toContain('修复排队消息');
    expect(view.container.querySelector('[data-active="true"]')?.textContent).toContain('会话-a');
    view.unmount();
  });

  test('查询过滤无匹配：过滤空态文案（B7 回归——文案直读 copy 单轨）', () => {
    seedLive({ a: makeSession('a') });
    uiStore.setState({ sidebarQuery: 'zzz-不存在' });
    const view = render(<Sidebar />);
    expect(view.container.textContent).toContain('没有匹配的会话');
    view.unmount();
  });

  test('置顶区：pinnedSessions 命中的行进置顶分区', () => {
    seedLive(
      { a: makeSession('a'), b: makeSession('b') },
      'b',
      makePreferences({ pinnedSessions: ['/tmp/pai/sessions/a.jsonl'] }),
    );
    const view = render(<Sidebar />);
    expect(view.container.textContent).toContain('已置顶');
    const pinnedRow = view.container.querySelector('[data-active="true"]');
    expect(pinnedRow?.textContent).toContain('会话-b');
    view.unmount();
  });

  test('项目视图：文件夹行 + 项目分组渲染', () => {
    seedLive({ a: makeSession('a', { cwd: '/tmp/pai' }), b: makeSession('b', { cwd: '/tmp/other' }) });
    uiStore.setState({ sidebarView: 'projects' });
    const view = render(<Sidebar />);
    expect(view.container.textContent).toContain('pai');
    expect(view.container.textContent).toContain('other');
    view.unmount();
  });

  test('归档与隐藏项目过滤：偏好命中的会话不出列表（与设置页同源真相）', () => {
    seedLive(
      { a: makeSession('a'), b: makeSession('b'), c: makeSession('c', { cwd: '/tmp/hidden' }) },
      null,
      makePreferences({
        archivedSessions: ['/tmp/pai/sessions/b.jsonl'],
        hiddenProjects: ['/tmp/hidden'],
      }),
    );
    const view = render(<Sidebar />);
    expect(view.container.textContent).toContain('会话-a');
    expect(view.container.textContent).not.toContain('会话-b');
    expect(view.container.textContent).not.toContain('会话-c');
    view.unmount();
  });
});

describe('Sidebar 交互（客户端渲染，动作直落 store）', () => {
  test('快捷区「新建任务」→ newTaskOpen；「搜索」→ 展开并聚焦输入框', () => {
    seedLive({});
    const view = render(<Sidebar />);
    const buttons = [...view.container.querySelectorAll('button')];
    React.act(() => {
      buttons.find((b) => b.textContent?.includes('新建任务'))?.click();
    });
    expect(uiStore.getState().newTaskOpen).toBe(true);
    React.act(() => {
      buttons.find((b) => b.textContent?.includes('搜索'))?.click();
    });
    const ui = uiStore.getState();
    expect(ui.sidebarSearchOpen).toBe(true);
    expect(ui.searchFocusToken).toBe(1);
    expect((document.activeElement as HTMLInputElement | null)?.tagName).toBe('INPUT');
    view.unmount();
  });

  test('搜索框受控回显（store → input）与过滤联动；Esc 收起并清空（过滤词不残留）', () => {
    // 装置适配（T32）：happy-dom + React 19 的 input 合成事件链不通（click/keydown 正常），
    // 「输入 → store」方向由 SidebarSearchInput 的受控 props 装配（3 行）经对抗审查覆盖，
    // 此处以 store 种子驱动过滤行为并断言受控回显（双向覆盖的单侧化）。
    seedLive({ a: makeSession('a', { title: '修复排队消息' }), b: makeSession('b', { title: '另一条' }) });
    uiStore.getState().openSidebarSearch();
    uiStore.setState({ sidebarQuery: '排队' });
    const view = render(<Sidebar />);
    const input = view.container.querySelector('input[aria-label="搜索"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('排队'); // 受控回显：store 真相驱动输入框
    expect(view.container.textContent).toContain('修复排队消息');
    expect(view.container.textContent).not.toContain('另一条');
    React.act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    const ui = uiStore.getState();
    expect(ui.sidebarSearchOpen).toBe(false);
    expect(ui.sidebarQuery).toBe('');
    view.unmount();
  });

  test('底部工具条：设置/用量开合直落 store', () => {
    seedLive({});
    const view = render(<Sidebar />);
    const buttons = [...view.container.querySelectorAll('button')];
    React.act(() => {
      buttons.find((b) => b.getAttribute('aria-label') === '设置')?.click();
    });
    expect(uiStore.getState().settingsOpen).toBe(true);
    React.act(() => {
      buttons.find((b) => b.getAttribute('aria-label') === '用量')?.click();
    });
    expect(uiStore.getState().usageOpen).toBe(true);
    view.unmount();
  });

  test('项目文件面板：占位侧栏内容区（列表/快捷区不渲染），关闭即复位', () => {
    seedLive({ a: makeSession('a') });
    uiStore.setState({ projectFiles: { target: { name: 'pai', path: '/tmp/pai' }, tree: [], loading: true } });
    const view = render(<Sidebar />);
    expect(view.container.textContent).not.toContain('新建任务');
    expect(view.container.textContent).not.toContain('会话-a');
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '关闭')?.click();
    });
    expect(uiStore.getState().projectFiles.target).toBe(null);
    expect(view.container.textContent).toContain('新建任务');
    view.unmount();
  });

  test('清空搜索钮：查询非空时在位，空查询不渲染', () => {
    seedLive({ a: makeSession('a') });
    uiStore.getState().openSidebarSearch();
    uiStore.setState({ sidebarQuery: 'x' });
    const view = render(<Sidebar />);
    const input = view.container.querySelector('input[aria-label="搜索"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('x'); // 受控回显
    React.act(() => {
      uiStore.getState().setSidebarQuery('');
    });
    expect(view.container.querySelector('button[aria-label="清空搜索"]')).toBeNull();
    React.act(() => {
      uiStore.getState().setSidebarQuery('x');
    });
    expect(view.container.querySelector('button[aria-label="清空搜索"]')).not.toBeNull();
    view.unmount();
  });

  test('显示更多接线（T32 §3.4 矩阵行 1）：截断组给入口，点击解除截断（store expanded + 行数增加）', () => {
    const sessions: Record<string, SessionView> = {};
    for (let i = 0; i < 8; i += 1) {
      sessions[`s${i}`] = makeSession(`s${i}`, { cwd: '/tmp/pai', title: `任务-${i}` });
    }
    seedLive(sessions);
    uiStore.setState({ sidebarView: 'projects' });
    const view = render(<Sidebar />);
    const rowsBefore = view.container.querySelectorAll('[data-active]').length;
    expect(view.container.textContent).toContain('显示更多');
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.textContent === '显示更多')?.click();
    });
    expect(uiStore.getState().sidebarGroupFold.expanded.has('/tmp/pai')).toBe(true);
    expect(view.container.textContent).not.toContain('显示更多');
    expect(view.container.querySelectorAll('[data-active]').length).toBeGreaterThan(rowsBefore);
    view.unmount();
  });

  test('视图切换 Tab：分组 ↔ 项目', () => {
    seedLive({ a: makeSession('a') });
    const view = render(<Sidebar />);
    const projectTab = [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('项目'));
    React.act(() => {
      projectTab?.click();
    });
    expect(uiStore.getState().sidebarView).toBe('projects');
    view.unmount();
  });
});

describe('重渲边界回归（B1/B2）', () => {
  test('B1：无关 store 更新零穿透侧栏子树，订阅切片更新正常到达（0-props 结构上不存在不稳定 props——旧「内联对象击穿 memo」病根除）', () => {
    seedLive({ a: makeSession('a') });
    let commits = 0;
    const countCommit = (): void => { commits += 1; };
    const probe = renderProbe('host');
    // Sidebar 元素、Profiler onRender、Host 全部稳定引用：children 每次重建会让
    // Profiler 自身随父级提交（假阳性），受测对象是子树对 store 更新的响应。
    const view = render(
      <CommitProbeHost probe={probe.Probe} onCommit={countCommit} sidebar={<Sidebar />} tick={0} />,
    );
    commits = 0;
    // 无关切片 set（草稿，侧栏不订阅）：子树零提交
    React.act(() => {
      uiStore.setState({ composerDraft: 'unrelated' });
    });
    expect(commits).toBe(0);
    // 订阅切片 set（过滤词）：子树提交——边界只挡无关更新，不挡正常更新
    React.act(() => {
      uiStore.setState({ sidebarQuery: '会话' });
    });
    expect(commits).toBeGreaterThan(0);
    // 宿主重渲照常发生（阳性对照：探针非 memo，随宿主渲染）
    view.rerender(
      <CommitProbeHost probe={probe.Probe} onCommit={countCommit} sidebar={<Sidebar />} tick={1} />,
    );
    expect(probe.count()).toBeGreaterThan(0);
    view.unmount();
  });

  test('B2：ages 30s tick 只重渲侧栏子树，宿主组件零重渲', () => {
    jest.useFakeTimers();
    seedLive({ a: makeSession('a') });
    let sidebarCommits = 0;
    const countSidebarCommit = (): void => { sidebarCommits += 1; };
    const probe = renderProbe('host');
    const view = render(
      <CommitProbeHost probe={probe.Probe} onCommit={countSidebarCommit} sidebar={<Sidebar />} />,
    );
    sidebarCommits = 0;
    probe.reset();
    React.act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(sidebarCommits).toBeGreaterThan(0); // tick 驱动列表区重算相对时间
    expect(probe.count()).toBe(0); // B2 症状：tick 在 WorkspaceMain 层 → 全工作区树周期重渲
    view.unmount();
  });
});
