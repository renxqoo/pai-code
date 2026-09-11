import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { installPanelSearcher, openFilePicker, openFileTab } from '../panel-controller';
import { singletonTab } from '@/panel/panel-state';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import type { SessionView } from '@paiapp/contracts';

/** 面板控制器：文件 tab 按活跃 cwd 寻址、选择弹窗全量拉取（注入缝+代次守卫+失败空态）。 */

function seedThread(cwd: string): void {
  const session: SessionView = {
    threadId: 't1',
    cwd,
    sessionPath: '/tmp/pai/s/t1.jsonl',
    title: '会话',
    state: 'live',
    streaming: false,
    model: 'm',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
  liveStore.setState({ sessions: { t1: session }, activeThreadId: 't1', threads: { t1: initialThreadState } });
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  installPanelSearcher(() => Promise.resolve(null));
});

describe('panel-controller', () => {
  test('openFileTab：按活跃会话 cwd 记忆 tab（cwd+path）', () => {
    seedThread('/tmp/pai');
    openFileTab('src/a.ts');
    const panel = uiStore.getState().panel;
    expect(panel.tabs).toHaveLength(1);
    expect(panel.tabs[0]).toMatchObject({ kind: 'file', cwd: '/tmp/pai', path: 'src/a.ts' });
  });

  test('openFilePicker：开弹窗即清单；响应到达落全量', async () => {
    seedThread('/tmp/pai');
    let deliver: ((paths: string[] | null) => void) | null = null;
    const pending = new Promise<string[] | null>((resolve) => {
      deliver = resolve;
    });
    installPanelSearcher(() => pending);
    openFilePicker();
    const opened = uiStore.getState();
    expect(opened.filePickerOpen).toBe(true);
    expect(opened.filePickerItems).toEqual([]);
    deliver?.(['a.ts', 'b.ts']);
    await pending;
    await Promise.resolve();
    expect(uiStore.getState().filePickerItems).toEqual(['a.ts', 'b.ts']);
  });

  test('代次守卫：快速重开丢迟到响应（旧响应不覆盖新一轮清单）', async () => {
    seedThread('/tmp/pai');
    let resolveFirst: ((paths: string[] | null) => void) | null = null;
    installPanelSearcher(() => new Promise((resolve) => { resolveFirst = resolve; }));
    openFilePicker();
    let resolveSecond: ((paths: string[] | null) => void) | null = null;
    installPanelSearcher(() => new Promise((resolve) => { resolveSecond = resolve; }));
    openFilePicker();
    resolveFirst?.(['旧响应']);
    await Promise.resolve();
    expect(uiStore.getState().filePickerItems).toEqual([]);
    resolveSecond?.(['新响应']);
    await Promise.resolve();
    await Promise.resolve();
    expect(uiStore.getState().filePickerItems).toEqual(['新响应']);
  });

  test('搜索失败（null）：保持空清单降级，弹窗不关', async () => {
    seedThread('/tmp/pai');
    installPanelSearcher(() => Promise.resolve(null));
    openFilePicker();
    await Promise.resolve();
    await Promise.resolve();
    expect(uiStore.getState().filePickerOpen).toBe(true);
    expect(uiStore.getState().filePickerItems).toEqual([]);
  });

  test('无活跃会话：openFileTab 以空 cwd 记忆（与旧行为一致——读取时按 cwd 寻址降级）', () => {
    liveStore.setState({ activeThreadId: null });
    openFileTab('a.ts');
    const tab = uiStore.getState().panel.tabs[0];
    expect(tab).toMatchObject({ kind: 'file', cwd: '', path: 'a.ts' });
  });
});

describe('ui store panel 动作（panel-state 纯函数包装）', () => {
  test('头部开关：开=整组收起；关=以 Diff 打开', () => {
    const ui = uiStore.getState();
    ui.togglePanelFromHeader(); // 空 → diff 打开
    expect(uiStore.getState().panel.tabs).toHaveLength(1);
    uiStore.getState().togglePanelFromHeader(); // 开 → 整组收起
    expect(uiStore.getState().panel.tabs).toHaveLength(0);
  });

  test('openAgents/toggle/close/focus 族语义保持', () => {
    const ui = uiStore.getState();
    ui.openAgentsPane();
    expect(uiStore.getState().panel.tabs[0]).toMatchObject(singletonTab('agents'));
    uiStore.getState().openDiffPane();
    expect(uiStore.getState().panel.tabs).toHaveLength(2);
    const active = uiStore.getState().panel.activeId;
    uiStore.getState().closePanelTabById(active);
    expect(uiStore.getState().panel.tabs).toHaveLength(1);
    uiStore.getState().closePanel();
    expect(uiStore.getState().panel.tabs).toHaveLength(0);
  });
});
