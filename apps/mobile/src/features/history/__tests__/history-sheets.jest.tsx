import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ArchiveAction } from '@/features/history/archive-action';
import { DeleteAction } from '@/features/history/delete-action';
import { HistoryDrawer } from '@/features/history/history-drawer';
import { PinAction } from '@/features/history/pin-action';
import { SessionSheet } from '@/features/history/session-sheet';
import { demoSessions } from '@/fixtures/demo-data';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

describe('history sheets', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useHistoryStore.setState({ sessions: demoSessions, query: '' });
    useConversationStore.getState().startNewSession();
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
  });

  it('starts a new session and navigates to settings', async () => {
    await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
    const view = await render(<TestWrapper><HistoryDrawer /></TestWrapper>);
    await fireEvent.press(view.getByText('新建对话'));
    expect(useConversationStore.getState().activeSessionId).toBeNull();
    await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
    await view.rerender(<TestWrapper><HistoryDrawer /></TestWrapper>);
    await fireEvent.press(view.getByText('个人设置'));
    expect(mockPush).toHaveBeenLastCalledWith('/settings');
  });

  it('opens search results when the drawer query is submitted', async () => {
    await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
    const view = await render(<TestWrapper><HistoryDrawer /></TestWrapper>);
    await fireEvent.changeText(view.getByLabelText('搜索对话'), 'Pai Mobile');
    await fireEvent(view.getByLabelText('搜索对话'), 'submitEditing');
    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('navigates to devices, files, projects and archive', async () => {
    await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
    const view = await render(<TestWrapper><HistoryDrawer /></TestWrapper>);
    await fireEvent.press(view.getByText('连接电脑'));
    expect(mockPush).toHaveBeenCalledWith('/devices');
    await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
    await view.rerender(<TestWrapper><HistoryDrawer /></TestWrapper>);
    await fireEvent.press(view.getByText('资产'));
    expect(mockPush).toHaveBeenCalledWith('/files');
    await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
    await view.rerender(<TestWrapper><HistoryDrawer /></TestWrapper>);
    await fireEvent.press(view.getByText('+ 添加项目'));
    expect(mockPush).toHaveBeenCalledWith('/projects');
  });

  it('opens a session action sheet from drawer', async () => {
    await act(() => Promise.resolve(useNavigationStore.getState().setDrawerOpen(true)));
    const view = await render(<TestWrapper><HistoryDrawer /></TestWrapper>);
    await fireEvent.press(view.getByLabelText('Pai Mobile 视觉走查 更多操作'));
    expect(useNavigationStore.getState().sheet).toBe('session-actions');
  });

  it('renames, pins, archives and deletes active session', async () => {
    const session = demoSessions[1];
    if (session === undefined) throw new Error('fixture missing');
    useConversationStore.getState().openSession(session);
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('session-actions')));
    const view = await render(<TestWrapper><SessionSheet /></TestWrapper>);
    await fireEvent.changeText(view.getByLabelText('对话名称'), '新会话');
    await fireEvent(view.getByLabelText('对话名称'), 'submitEditing');
    expect(useHistoryStore.getState().sessions.find((item) => item.id === session.id)?.title).toBe('新会话');
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('session-actions')));
    await view.rerender(<TestWrapper><SessionSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('置顶'));
    expect(useHistoryStore.getState().sessions.find((item) => item.id === session.id)?.pinned).toBe(true);
  });

  it('renders session action wrappers and destructive action', async () => {
    const pin = jest.fn();
    const archive = jest.fn();
    const remove = jest.fn();
    const view = await render(<><PinAction onPress={pin} /><ArchiveAction onPress={archive} /><DeleteAction onPress={remove} /></>);
    await fireEvent.press(view.getByText('置顶'));
    await fireEvent.press(view.getByText('归档'));
    await fireEvent.press(view.getByText('删除'));
    expect(pin).toHaveBeenCalledTimes(1);
    expect(archive).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
