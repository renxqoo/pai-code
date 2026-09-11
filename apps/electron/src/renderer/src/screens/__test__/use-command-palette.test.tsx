import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { useCommandPalette, usePaletteItems } from '../use-command-palette';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import type { SessionView } from '@paiapp/contracts';

/** 命令面板装配：开合本地态 + onSelect 派发全分支（actions/uiStore/通道单例 spy）+ 条目 hook 数据面。 */

function seedSession(): void {
  const session: SessionView = {
    threadId: 't1',
    cwd: '/tmp/pai',
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

/** 测试宿主（hook 消费）：装配面与条目面双 hook，状态外置给断言。 */
let api: ReturnType<typeof useCommandPalette> | null = null;
let items: readonly unknown[] = [];
function PaletteHarness(): React.JSX.Element {
  api = useCommandPalette({
    openNewTask: () => uiStore.getState().openNewTask(''),
    openSettings: () => uiStore.getState().openSettings(),
    openSettingsAt: (section) => uiStore.getState().openSettingsAt(section),
    openUsage: () => uiStore.getState().openUsage(),
    navigateSession: () => undefined,
  });
  items = usePaletteItems(true);
  return <span data-testid="palette" />;
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

describe('useCommandPalette', () => {
  test('开合：toggle 翻转、close 关闭', () => {
    seedSession();
    const view = render(<PaletteHarness />);
    expect(api?.open).toBe(false);
    React.act(() => {
      api?.toggle();
    });
    expect(api?.open).toBe(true);
    React.act(() => {
      api?.close();
    });
    expect(api?.open).toBe(false);
    view.unmount();
  });

  test('onSelect 派发：新建任务/设置分区/用量/面板/关闭会话/斜杠命令回填', () => {
    seedSession();
    const view = render(<PaletteHarness />);
    const close = jest.spyOn(workspaceActions, 'closeSession');
    React.act(() => {
      api?.onSelect('action:newTask');
    });
    expect(uiStore.getState().newTaskOpen).toBe(true);
    React.act(() => {
      api?.onSelect('settings:providers');
    });
    expect(uiStore.getState().settingsEntry).toBe('providers');
    React.act(() => {
      api?.onSelect('action:openUsage');
    });
    expect(uiStore.getState().usageOpen).toBe(true);
    React.act(() => {
      api?.onSelect('action:openDiff');
    });
    expect(uiStore.getState().panel.tabs).toHaveLength(1);
    React.act(() => {
      api?.onSelect('action:closeSession');
    });
    expect(close).toHaveBeenCalledWith('t1');
    // 斜杠命令回填（controller 通道）：草稿写入活跃线程
    uiStore.getState().setDraft('t1', '');
    React.act(() => {
      api?.onSelect('command:skill:writer ');
    });
    expect(uiStore.getState().drafts.t1).toContain('/skill:writer'); // 尾随空格拼接语义由 controller 单测钉住
    view.unmount();
  });
});

describe('usePaletteItems', () => {
  test('数据面：有会话/有 cwd 时操作组含会话级动作；会话组渲染种子标题', () => {
    seedSession();
    const view = render(<PaletteHarness />);
    const text = JSON.stringify(items);
    expect(text).toContain('会话');
    expect(items.length).toBeGreaterThan(0);
    view.unmount();
  });
});
