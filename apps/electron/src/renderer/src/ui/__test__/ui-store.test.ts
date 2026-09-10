import { beforeEach, describe, expect, test } from 'bun:test';

import { createUiStore, type UiStore } from '../ui-store';

/** 每用例独立实例（生产单例不复位参与，避免用例间串扰）。 */

describe('ui store', () => {
  let store: UiStore;

  beforeEach(() => {
    store = createUiStore();
  });

  test('初始态：全部字段为空形态/缺省几何', () => {
    const s = store.getState();
    expect(s.sidebarWidth).toBe(264);
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.sidebarView).toBe('grouped');
    expect(s.sidebarSearchOpen).toBe(false);
    expect(s.sidebarQuery).toBe('');
    expect(s.searchFocusToken).toBe(0);
    expect(s.settingsOpen).toBe(false);
    expect(s.settingsEntry).toBe(null);
    expect(s.usageOpen).toBe(false);
    expect(s.newTaskOpen).toBe(false);
    expect(s.composerDraft).toBe('');
    expect(s.drafts).toEqual({});
    expect(s.projectFiles).toEqual({ target: null, tree: [], loading: false });
  });

  test('openSidebarSearch：收起态先展开（焦点不得劫进零宽容器）+ token 递增；重复触发再递增', () => {
    store.setState({ sidebarCollapsed: true });
    store.getState().openSidebarSearch();
    let s = store.getState();
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.sidebarSearchOpen).toBe(true);
    expect(s.searchFocusToken).toBe(1);
    store.getState().openSidebarSearch();
    s = store.getState();
    expect(s.searchFocusToken).toBe(2);
  });

  test('closeSidebarSearch：收起并清空过滤词', () => {
    store.setState({ sidebarSearchOpen: true, sidebarQuery: 'pai' });
    store.getState().closeSidebarSearch();
    const s = store.getState();
    expect(s.sidebarSearchOpen).toBe(false);
    expect(s.sidebarQuery).toBe('');
  });

  test('groupFold：折叠切换联动重置该组展开态，再展开恢复（行为单一真相在 group-collapse 纯函数）', () => {
    store.getState().expandGroupKey('proj-a');
    expect(store.getState().sidebarGroupFold.expanded.has('proj-a')).toBe(true);
    store.getState().toggleGroupFoldKey('proj-a');
    const folded = store.getState().sidebarGroupFold;
    expect(folded.collapsed.has('proj-a')).toBe(true);
    expect(folded.expanded.has('proj-a')).toBe(false);
    store.getState().toggleGroupFoldKey('proj-a');
    expect(store.getState().sidebarGroupFold.collapsed.has('proj-a')).toBe(false);
  });

  test('设置页开合：closeSettings 同时清一次性分区入口；openSettingsAt 带入口进入', () => {
    store.getState().openSettingsAt('providers');
    expect(store.getState().settingsEntry).toBe('providers');
    expect(store.getState().settingsOpen).toBe(true);
    store.getState().closeSettings();
    const s = store.getState();
    expect(s.settingsOpen).toBe(false);
    expect(s.settingsEntry).toBe(null);
    // 普通打开不引入入口
    store.getState().openSettings();
    expect(store.getState().settingsEntry).toBe(null);
  });

  test('openNewTask：key 递增（重复进入即重挂载）、浮层复位、目录写入；closeNewTask 只关开合', () => {
    store.setState({ newTaskDialogOpen: true });
    store.getState().openNewTask('/tmp/pai');
    let s = store.getState();
    expect(s.newTaskOpen).toBe(true);
    expect(s.newTaskCwd).toBe('/tmp/pai');
    expect(s.newTaskKey).toBe(1);
    expect(s.newTaskDialogOpen).toBe(false);
    store.getState().openNewTask('');
    s = store.getState();
    expect(s.newTaskKey).toBe(2);
    expect(s.newTaskCwd).toBe('');
    store.getState().closeNewTask();
    expect(store.getState().newTaskOpen).toBe(false);
    expect(store.getState().newTaskKey).toBe(2);
  });

  test('草稿：无活跃线程只写 composerDraft；有线程双写；clear 双清且幂等；restore 只落会话槽', () => {
    store.getState().setDraft('', 'hello');
    expect(store.getState().composerDraft).toBe('hello');
    expect(store.getState().drafts).toEqual({});
    store.getState().setDraft('t1', 'draft-1');
    const s = store.getState();
    expect(s.composerDraft).toBe('draft-1');
    expect(s.drafts).toEqual({ t1: 'draft-1' });
    store.getState().restoreDraft('t2', 'restored');
    expect(store.getState().drafts).toEqual({ t1: 'draft-1', t2: 'restored' });
    store.getState().clearDraft('t1');
    const cleared = store.getState();
    expect(cleared.composerDraft).toBe('');
    expect(cleared.drafts).toEqual({ t2: 'restored' });
    // 不存在的键清理幂等（引用不变）
    const before = cleared.drafts;
    store.getState().clearDraft('t1');
    expect(store.getState().drafts).toBe(before);
  });

  test('projectFiles 面数据面：begin 清树置加载，complete 落树停载（保留目标），close 复位', () => {
    store.getState().beginProjectFiles({ name: 'pai', path: '/tmp/pai' });
    let s = store.getState().projectFiles;
    expect(s).toEqual({ target: { name: 'pai', path: '/tmp/pai' }, tree: [], loading: true });
    store.getState().completeProjectFiles([{ name: 'a.ts', path: 'a.ts', children: [] }]);
    s = store.getState().projectFiles;
    expect(s.loading).toBe(false);
    expect(s.tree).toHaveLength(1);
    expect(s.target).toEqual({ name: 'pai', path: '/tmp/pai' });
    store.getState().closeProjectFiles();
    expect(store.getState().projectFiles).toEqual({ target: null, tree: [], loading: false });
  });

  test('toggleSidebarCollapsed 翻转；collapseSidebar 单向收起', () => {
    store.getState().toggleSidebarCollapsed();
    expect(store.getState().sidebarCollapsed).toBe(true);
    store.getState().toggleSidebarCollapsed();
    expect(store.getState().sidebarCollapsed).toBe(false);
    store.getState().collapseSidebar();
    expect(store.getState().sidebarCollapsed).toBe(true);
  });

  test('reset 回到初始态（测试隔离缝）', () => {
    store.getState().openNewTask('/x');
    store.getState().setDraft('t1', 'd');
    store.getState().reset();
    expect(store.getState().newTaskOpen).toBe(false);
    expect(store.getState().drafts).toEqual({});
  });
});
