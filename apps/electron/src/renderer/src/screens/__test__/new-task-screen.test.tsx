import { describe, expect, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CommandView, GitBranchesView } from '@paiapp/contracts';

import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { greetingKeyOf } from '@/lib/greeting';
import { greetingTexts } from '@/screens/new-task-view-model';
import { render } from '@/testing/render';
import { copy } from '@/strings';

import { NewTaskScreen } from '../new-task-screen';

/**
 * 新建任务整页冒烟（仓库静态口径：SSR 不跑 effect，分支视图恒为「在途/空」态；
 * 弹窗交互与分支切换走真机走查 + 路由级真 git 集成）。
 */
function renderScreen(overrides: Partial<Parameters<typeof NewTaskScreen>[0]> = {}): string {
  return renderToStaticMarkup(
    <NewTaskScreen
      knownDirs={['/w/app', '/w/cli']}
      commands={[]}
      defaultCwd="/w/app"
      trustedDefault={false}
      defaultModelFor={() => 'glm/glm-4.7'}
      modelOptions={['glm/glm-4.7', 'glm/glm-5.3']}
      noModelsLabel={copy.composer.noModels}
      defaultPermissionMode="acceptEdits"
      onSearchFiles={() => Promise.resolve(null)}
      onListBranches={() => Promise.resolve({ ok: true, data: { isRepo: true, current: 'main', branches: ['main'], dirtyFiles: 0 } })}
      onListGraph={() => Promise.resolve({ ok: true, data: { isRepo: true, commits: [], truncated: false } })}
      onCheckoutBranch={() => Promise.resolve({ ok: true, data: { branch: 'main' } })}
      onPickDirectory={() => Promise.resolve(null)}
      onCreate={() => Promise.resolve(true)}
      onClose={() => undefined}
      onNotify={() => undefined}
      onDialogOpenChange={() => undefined}
      {...overrides}
    />,
  );
}

describe('NewTaskScreen', () => {
  test('问候语按时段 + 占位文案 + 四条快捷胶囊', () => {
    const html = renderScreen();
    expect(html).toContain(greetingTexts(greetingKeyOf(new Date().getHours())).title);
    expect(html).toContain(copy.newTask.placeholder);
    for (const label of copy.newTask.quickTasks) expect(html).toContain(label);
  });

  test('上下文条：项目段显示目录名、分支段在途给加载文案（SSR 不跑 effect）', () => {
    const html = renderScreen();
    expect(html).toContain('aria-label="工作目录"');
    expect(html).toContain('>app<');
    expect(html).toContain(copy.composer.branchLoading);
  });

  test('症状回归：新建页思考档默认态可选（跟随缺省），用量入口仍不渲染（无会话数据面）', () => {
    const html = renderScreen();
    // 思考档控件以「默认」态渲染——发消息前即可选择（四档菜单为弹层项，静态口径只验触发器）
    expect(html).toContain('aria-label="默认"');
    expect(html).toContain(copy.composer.effortDefault);
    // 用量入口是会话面数据，不摆假控件
    expect(html).not.toContain(copy.composer.usageSummary);
    // 附件与发送保留（可附图提交）
    expect(html).toContain(copy.composer.attach);
    expect(html).toContain(copy.composer.send);
  });

  test('权限模式控件渲染 hub 缺省档（本地未选时展示并作为不干预基线）', () => {
    const html = renderScreen();
    expect(html).toContain(copy.settings.permModeOptions.acceptEdits);
  });

  test('无预选目录：只渲染「选择工作区」入口，不渲染分支段（未选目录不是「分支不可用」）', () => {
    const html = renderScreen({ defaultCwd: '', knownDirs: [] });
    expect(html).toContain(copy.newTask.workspacePickerTitle);
    expect(html).not.toContain(copy.composer.branchUnavailable);
    expect(html).not.toContain(copy.composer.branchLoading);
    expect(html).toContain(copy.newTask.placeholder);
  });

  test('症状回归：新建任务页输入 / 无命令面板——commands 属性接入预构目录（启用技能条目）', () => {
    // 目录数据源经 use-new-task-page（command/preview）装配；本用例锁定页面属性面：
    // 预构目录非空时输入区正常渲染（`/` 触发数据源不再恒空），空目录时页面不回归。
    const catalog: readonly CommandView[] = [{ name: 'skill:rxopen-hot', description: '查热搜', source: 'skill' }];
    const withCatalog = renderScreen({ commands: catalog });
    expect(withCatalog).toContain(copy.newTask.placeholder);
    expect(withCatalog).toContain(copy.composer.send);
    const emptyCatalog = renderScreen({ commands: [] });
    expect(emptyCatalog).toContain(copy.newTask.placeholder);
  });
});

describe('NewTaskScreen 分支切换锁（T36：与线程页同一把，目录上线程在跑即只读）', () => {
  const REPO_VIEW: GitBranchesView = { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 };

  /** 客户端渲染装置：页面订阅 live store（锁判定）与分支视图（面板入口）。 */
  function screenProps(overrides: Partial<Parameters<typeof NewTaskScreen>[0]> = {}) {
    return {
      knownDirs: ['/w/app'],
      commands: [] as readonly CommandView[],
      defaultCwd: '/w/app',
      trustedDefault: false,
      defaultModelFor: () => 'glm/glm-4.7',
      modelOptions: ['glm/glm-4.7'],
      noModelsLabel: copy.composer.noModels,
      defaultPermissionMode: 'default' as const,
      onSearchFiles: () => Promise.resolve(null),
      onListBranches: () => Promise.resolve({ ok: true as const, data: { ...REPO_VIEW, branches: [...REPO_VIEW.branches] } }),
      onListGraph: () => Promise.resolve({ ok: true as const, data: { isRepo: true, commits: [], truncated: false } }),
      onCheckoutBranch: () => Promise.resolve({ ok: true as const, data: { branch: 'dev' } }),
      onPickDirectory: () => Promise.resolve(null),
      onCreate: () => Promise.resolve(true),
      onClose: () => undefined,
      onNotify: () => undefined,
      onDialogOpenChange: () => undefined,
      ...overrides,
    };
  }

  function seedRunning(running: boolean): void {
    liveStore.setState({
      sessions: {
        't-run': {
          threadId: 't-run',
          cwd: '/w/app',
          sessionPath: '/w/app/s/t-run.jsonl',
          title: '运行中会话',
          state: 'live',
          streaming: false,
          model: 'glm/glm-4.7',
          thinkingLevel: null,
          lastActivityAt: Date.now(),
        },
      },
      activeThreadId: null,
      threads: { 't-run': { ...initialThreadState, streaming: running } },
    });
  }

  test('所选目录上线程在跑：分支段退回只读（无面板触发器）；空闲恢复触发器', async () => {
    seedRunning(true);
    const locked = render(<NewTaskScreen {...screenProps()} />);
    await React.act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect([...locked.container.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === copy.composer.branchSegment)).toBe(false);
    locked.unmount();

    seedRunning(false);
    const idle = render(<NewTaskScreen {...screenProps()} />);
    await React.act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect([...idle.container.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === copy.composer.branchSegment)).toBe(true);
    idle.unmount();
    liveStore.getState().reset();
  });

  test('症状回归：面板打开即重拉分支视图——脏计数随工作区实时变化，缓存快照会过期', async () => {
    seedRunning(false);
    let calls = 0;
    const props = screenProps({
      onListBranches: () => {
        calls += 1;
        return Promise.resolve({ ok: true as const, data: { ...REPO_VIEW, branches: [...REPO_VIEW.branches] } });
      },
    });
    const view = render(<NewTaskScreen {...props} />);
    await React.act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect(calls).toBe(1); // cwd 就绪首拉
    React.act(() => {
      [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === copy.composer.branchSegment)?.click();
    });
    await React.act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect(calls).toBe(2); // 打开面板刷新脏计数
    view.unmount();
    liveStore.getState().reset();
  });
});
