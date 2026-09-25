import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { demoSessions } from '@/fixtures/demo-data';
import { ChatHeader } from '@/features/chat/chat-header';
import { EmptyChat } from '@/features/chat/empty-chat';
import { MessageRow } from '@/features/chat/message-row';
import { PermissionCard } from '@/features/chat/permission-card';
import { SessionRow } from '@/features/history/session-row';
import { WorkspaceSheet } from '@/features/workspace/workspace-sheet';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe('chat and history components', () => {
  beforeEach(() => {
    useNavigationStore.setState({ drawerOpen: false, sheet: null, tab: 'chat' });
    useConversationStore.getState().startNewSession();
  });

  it('renders every message presentation kind', async () => {
    const view = await render(<><MessageRow message={{ id: '1', kind: 'user', text: '用户消息', createdAt: 'now' }} /><MessageRow message={{ id: '2', kind: 'assistant', text: '助手消息', createdAt: 'now' }} /><MessageRow message={{ id: '3', kind: 'thinking', text: '分析中', createdAt: 'now' }} /><MessageRow message={{ id: '4', kind: 'tool', title: '执行', text: '完成', createdAt: 'now' }} /><MessageRow message={{ id: '5', kind: 'code', title: 'main.ts', language: 'ts', text: 'const x = 1', createdAt: 'now' }} /></>);
    expect(view.getByText('用户消息')).toBeTruthy();
    expect(view.getByText('思考过程')).toBeTruthy();
    expect(view.getByText('main.ts')).toBeTruthy();
  });

  it('opens empty workspace and resolves permission', async () => {
    const workspace = jest.fn();
    const view = await render(<><EmptyChat onWorkspace={workspace} /><PermissionCard /></>);
    await fireEvent.press(view.getByText('选择工作空间'));
    expect(workspace).toHaveBeenCalledTimes(1);
    await act(() => Promise.resolve(useConversationStore.getState().requestPermission({ id: 'p', title: '运行测试', command: 'bun test', approved: null })));
    await view.rerender(<PermissionCard />);
    await fireEvent.press(view.getByText('允许一次'));
    expect(useConversationStore.getState().permissionRequest?.approved).toBe(true);
  });

  it('renders chat header and opens history/actions', async () => {
    const view = await render(<ChatHeader />);
    await fireEvent.press(view.getByLabelText('打开对话历史'));
    expect(useNavigationStore.getState().drawerOpen).toBe(true);
    await fireEvent.press(view.getByLabelText('对话菜单'));
    expect(useNavigationStore.getState().sheet).toBe('session-actions');
  });

  it('opens and manages a session row', async () => {
    const session = demoSessions[1];
    if (session === undefined) throw new Error('fixture missing');
    const open = jest.fn();
    const action = jest.fn();
    const view = await render(<SessionRow onAction={action} onOpen={open} session={session} />);
    await fireEvent.press(view.getByLabelText(session.title));
    await fireEvent.press(view.getByLabelText(`${session.title} 更多操作`));
    expect(open).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('shows workspace options and selects one', async () => {
    useNavigationStore.getState().openSheet('workspace');
    const view = await render(<TestWrapper><WorkspaceSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('Pai Mobile'));
    expect(useNavigationStore.getState().sheet).toBeNull();
    expect(useConversationStore.getState()).toMatchObject({ workspaceId: 'workspace-mobile' });
  });
});
