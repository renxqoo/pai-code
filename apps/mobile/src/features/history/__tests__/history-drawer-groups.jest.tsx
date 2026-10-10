import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';

import { HistoryDrawer } from '@/features/history/history-drawer';
import { testSession } from '@/test/session-fixture';
import { TestWrapper } from '@/test/test-wrapper';
import { useConversationStore } from '@/store/conversation-store';
import { useGroupFoldStore } from '@/store/group-fold-store';
import { useHistoryStore } from '@/store/history-store';
import { useNavigationStore } from '@/store/navigation-store';
import type { ConversationSession } from '@/types/domain';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

const at = (minutesAgo: number): number => 1_700_000_000_000 - minutesAgo * 60_000;

const inProject = (id: string, project: string, minutesAgo: number): ConversationSession => testSession(id, { project, startedAtMs: at(minutesAgo), title: `会话 ${id}` });

const openDrawer = async (sessions: readonly ConversationSession[]): Promise<ReturnType<typeof render>> => {
  useHistoryStore.setState({ sessions, query: '' });
  await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
  return render(<TestWrapper><HistoryDrawer /></TestWrapper>);
};

describe('history drawer project groups', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useGroupFoldStore.setState({ collapsed: new Set<string>(), expanded: new Set<string>() });
    useHistoryStore.setState({ sessions: [], query: '' });
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useConversationStore.setState({ activeSessionId: null, workspaceId: null, workspacePath: null });
  });

  it('renders one folder group per project with its own sessions（按项目分组，置顶单独成段）', async () => {
    const view = await openDrawer([
      inProject('a1', '/work/alpha', 30),
      inProject('a2', '/work/alpha', 20),
      inProject('b1', '/work/beta', 10),
      testSession('pinned', { pinned: true, project: '/work/alpha', title: '置顶会话', startedAtMs: at(99) }),
    ]);
    expect(view.getByText('置顶')).toBeTruthy();
    expect(view.getByLabelText('置顶会话')).toBeTruthy();
    expect(view.getByLabelText('折叠项目 alpha')).toBeTruthy();
    expect(view.getByLabelText('折叠项目 beta')).toBeTruthy();
    expect(view.getByLabelText('会话 a1')).toBeTruthy();
    expect(view.getByLabelText('会话 b1')).toBeTruthy();
    expect(view.getAllByTestId('session-row')).toHaveLength(4);
  });

  it('collapses and restores a group from the folder row（折叠箭头收起组内会话，条数仍可见）', async () => {
    const view = await openDrawer([inProject('a1', '/work/alpha', 30), inProject('b1', '/work/beta', 10)]);
    await fireEvent.press(view.getByLabelText('折叠项目 alpha'));
    expect(view.queryByLabelText('会话 a1')).toBeNull();
    expect(view.getByLabelText('会话 b1')).toBeTruthy();
    expect(view.getByLabelText('展开项目 alpha')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('展开项目 alpha'));
    expect(view.getByLabelText('会话 a1')).toBeTruthy();
  });

  it('reveals the rest of a group from show more（显示更多放行第 6、7 条）', async () => {
    const many = Array.from({ length: 7 }, (_, index) => inProject(`s${index}`, '/work/alpha', index + 1));
    const view = await openDrawer(many);
    expect(view.getAllByTestId('session-row')).toHaveLength(5);
    await fireEvent.press(view.getByText('显示更多（还有 2 条）'));
    expect(view.getAllByTestId('session-row')).toHaveLength(7);
  });

  it('starts a new conversation scoped to the tapped project（组内 + 在该项目新建对话）', async () => {
    const view = await openDrawer([inProject('a1', '/work/alpha', 30)]);
    await act(() => Promise.resolve(useConversationStore.getState().openSession(inProject('a1', '/work/alpha', 30))));
    await fireEvent.press(view.getByLabelText('在 alpha 中新建对话'));
    const store = useConversationStore.getState();
    expect(store.activeSessionId).toBeNull();
    expect(store.workspaceId).toBe('/work/alpha');
    expect(store.workspacePath).toBe('/work/alpha');
    expect(useNavigationStore.getState().drawerOpen).toBe(false);
  });

  it('asks for a workspace instead of guessing one for the no-directory group（未选工作空间的组不静默建会话）', async () => {
    const view = await openDrawer([testSession('loose', { project: '' })]);
    expect(view.getByLabelText('折叠项目 无项目')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('在 无项目 中新建对话'));
    expect(useNavigationStore.getState().sheet).toBe('workspace');
    expect(useConversationStore.getState().activeSessionId).toBeNull();
  });

  it('windows the session list instead of mounting every row（侧边栏打开非常卡顿：上千条会话不再一次性全量挂载）', async () => {
    const sessions = Array.from({ length: 1515 }, (_, index) => inProject(`s${index}`, `/work/project-${index % 60}`, index + 1));
    const view = await openDrawer(sessions);
    const rendered = view.getAllByTestId('session-row');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThanOrEqual(40);
    expect(view.queryByLabelText('会话 s-1400')).toBeNull();
  });

  it('opens a tapped session from inside its group（点组内会话行：清未读、开会话、关抽屉）', async () => {
    const view = await openDrawer([testSession('a1', { project: '/work/alpha', unread: true })]);
    await fireEvent.press(view.getByLabelText('会话 a1'));
    expect(useConversationStore.getState().activeSessionId).toBe('a1');
    expect(useHistoryStore.getState().sessions[0]?.unread).toBe(false);
    expect(useNavigationStore.getState().drawerOpen).toBe(false);
  });

  it('tells the user when there is nothing to show yet（空列表给出空态而不是空白）', async () => {
    const view = await openDrawer([]);
    expect(view.getByText('还没有对话')).toBeTruthy();
    expect(view.getByText('+ 添加项目')).toBeTruthy();
  });
});