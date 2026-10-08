import { afterEach, describe, expect, test } from 'bun:test';
import * as React from 'react';
import { useStore } from 'zustand';

import { useCmdHotkeys } from '../cmd-hotkeys';
import { hotkeyGating } from '@/screens/hotkey-gating';
import { render } from '@/testing/render';
import { uiStore } from '@/ui/ui-store';

/**
 * ⌘K 独立门控接线回归（hook 层，键盘事件驱动）：面板键必须走独立分支——
 * 面板开着时 hotkeysEnabled 必为 false，若 ⌘K 误挂 enabled 分支将关不掉
 * 自己的面板。门控矩阵纯函数面由 hotkey-gating.test 钉住，此处钉
 * 「useCmdHotkeys × hotkeyGating × uiStore」装配链（与 workspace-main
 * 装配同构：门控输入经 useStore 订阅，动作落 ui store）。
 *
 * 键盘事件注意：happy-dom 的 KeyboardEvent init 只认标准 metaKey/ctrlKey
 * 字段——传 React 风格的 meta/ctrl 会被静默丢弃，事件变成无修饰键。
 */

const CMD_K = { key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
const CMD_N = { key: 'n', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };

/** 与 workspace-main 同构的装配：门控矩阵喂 hook，动作落 ui store。 */
function HotkeysHarness({ onNewThread }: { onNewThread: () => void }): null {
  const commandPanelOpen = useStore(uiStore, (s) => s.commandPanelOpen);
  const newTaskOpen = useStore(uiStore, (s) => s.newTaskOpen);
  const { hotkeysEnabled, panelHotkeyEnabled } = hotkeyGating({
    commandPanelOpen,
    newTaskOpen,
    usageOpen: false,
    settingsOpen: false,
    projectFilesOpen: false,
  });
  useCmdHotkeys(
    {
      onNewThread,
      onSearch: () => uiStore.getState().toggleCommandPanel(),
      onToggleDiff: () => undefined,
      onToggleAgents: () => undefined,
    },
    hotkeysEnabled,
    panelHotkeyEnabled,
  );
  return null;
}

function press(combo: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): void {
  React.act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', combo));
  });
}

afterEach(() => {
  uiStore.getState().reset();
});

describe('useCmdHotkeys × 门控矩阵接线', () => {
  test('⌘K toggle：关态打开、开态再按关闭（独立分支，不因 hotkeysEnabled=false 失效）', () => {
    const newThreadCalls: string[] = [];
    const view = render(<HotkeysHarness onNewThread={() => newThreadCalls.push('newThread')} />);
    expect(uiStore.getState().commandPanelOpen).toBe(false);
    press(CMD_K);
    expect(uiStore.getState().commandPanelOpen).toBe(true);
    // 面板开着 → hotkeysEnabled=false；⌘K 必须仍能关掉
    press(CMD_K);
    expect(uiStore.getState().commandPanelOpen).toBe(false);
    expect(newThreadCalls).toEqual([]);
    view.unmount();
  });

  test('面板开着时 ⌘N 不劫持（焦点不得从模态抢走）', () => {
    const newThreadCalls: string[] = [];
    uiStore.getState().openCommandPanel();
    const view = render(<HotkeysHarness onNewThread={() => newThreadCalls.push('newThread')} />);
    press(CMD_N);
    expect(newThreadCalls).toEqual([]);
    expect(uiStore.getState().newTaskOpen).toBe(false);
    view.unmount();
  });

  test('整页覆盖（新建任务页）开着时 ⌘K 不唤起', () => {
    const view = render(<HotkeysHarness onNewThread={() => undefined} />);
    React.act(() => {
      uiStore.getState().openNewTask('');
    });
    press(CMD_K);
    expect(uiStore.getState().commandPanelOpen).toBe(false);
    view.unmount();
  });
});
