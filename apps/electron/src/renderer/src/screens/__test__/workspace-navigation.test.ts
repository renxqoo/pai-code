import { beforeEach, describe, expect, test } from 'bun:test';

import { navigation } from '../workspace-navigation';
import { store } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 导航单例（T32 C2）：整页开合在 ui store、会话动作经 workspaceActions 委派。
 * 症状回归保留：新建任务页开着时点侧栏会话无反应——导航出口必须退出整页模式。
 */

beforeEach(() => {
  uiStore.getState().reset();
  store.getState().reset();
});

describe('navigation 单例', () => {
  test('侧栏选择会话：先退出新建任务页 → 切会话；不动设置页、不动右侧面板（面板按会话记忆——T30 审查 高-1 回归）', () => {
    uiStore.setState({ newTaskOpen: true, settingsOpen: true });
    navigation.onSelectSession('t1');
    const ui = uiStore.getState();
    expect(ui.newTaskOpen).toBe(false);
    expect(ui.settingsOpen).toBe(true);
    expect(store.getState().activeThreadId).toBe('t1');
  });

  test('设置页历史打开会话：退出新建任务页 → 打开会话 → 关设置页', () => {
    uiStore.setState({ newTaskOpen: true, settingsOpen: true });
    navigation.onOpenSavedSession('/s.jsonl');
    const ui = uiStore.getState();
    expect(ui.newTaskOpen).toBe(false);
    expect(ui.settingsOpen).toBe(false);
  });

  test('未打开新建任务页时退出是幂等空操作（closeNewTask 恒被调用）', () => {
    navigation.onSelectSession('a');
    navigation.onSelectSession('b');
    expect(store.getState().activeThreadId).toBe('b');
    expect(uiStore.getState().newTaskOpen).toBe(false);
  });
});
