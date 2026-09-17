import { beforeEach, describe, expect, test } from 'bun:test';

import { openFileTab } from '../panel-controller';
import { singletonTab } from '@/panel/panel-state';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import type { SessionView } from '@paiapp/contracts';

/** 面板控制器：文件 tab 按活跃 cwd 寻址（文件 tab 入口 = 命令面板 file: 条目与 Diff 列表点击）。 */

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

describe('panel-controller', () => {
  test('openFileTab：按活跃会话 cwd 记忆 tab（cwd+path）', () => {
    seedThread('/tmp/pai');
    openFileTab('src/a.ts');
    const panel = uiStore.getState().panel;
    expect(panel.tabs).toHaveLength(1);
    expect(panel.tabs[0]).toMatchObject({ kind: 'file', cwd: '/tmp/pai', path: 'src/a.ts' });
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
    if (active !== null) uiStore.getState().closePanelTabById(active);
    expect(uiStore.getState().panel.tabs).toHaveLength(1);
    uiStore.getState().closePanel();
    expect(uiStore.getState().panel.tabs).toHaveLength(0);
  });
});
