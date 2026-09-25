import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { ChatScreen } from '@/features/chat/chat-screen';
import { demoSessions } from '@/fixtures/demo-data';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useComposerStore } from '@/store/composer-store';
import { TestWrapper } from '@/test/test-wrapper';

describe('ChatScreen', () => {
  beforeEach(() => {
    useConversationStore.getState().startNewSession();
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
    useComposerStore.setState({ generating: false });
  });

  it('renders empty chat, opens workspace and enters the demo timeline', async () => {
    const view = await render(<TestWrapper><ChatScreen /></TestWrapper>);
    await fireEvent.press(view.getByText('选择工作空间'));
    expect(useNavigationStore.getState().sheet).toBe('workspace');
    await fireEvent.press(view.getByText('查看示例对话'));
    expect(useConversationStore.getState().session.id).toBe('session-refactor');
    expect(useConversationStore.getState().permissionRequest?.approved).toBeNull();
  });

  it('renders a grouped existing conversation and composer', async () => {
    const session = demoSessions[0];
    if (session === undefined) throw new Error('fixture missing');
    useConversationStore.getState().openSession(session);
    const view = await render(<TestWrapper><ChatScreen /></TestWrapper>);
    expect(view.getByText(session.messages[0]?.text ?? '')).toBeTruthy();
    expect(view.getByText('思考过程')).toBeTruthy();
    expect(view.getByLabelText('执行清单')).toBeTruthy();
    expect(view.getByText('4 / 5 · 16s')).toBeTruthy();
    expect(view.queryByText('执行过程')).toBeNull();
    expect(view.getByLabelText('消息输入框')).toBeTruthy();
    expect(view.getByTestId('conversation-scroll').props.contentContainerStyle).toMatchObject({ paddingBottom: 300 });
    await fireEvent.press(view.getByLabelText('收起执行清单'));
    expect(view.getByTestId('conversation-scroll').props.contentContainerStyle).toMatchObject({ paddingBottom: 152 });
    await fireEvent(view.getByLabelText('消息输入框'), 'focus');
    expect(view.getByTestId('conversation-scroll').props.contentContainerStyle).toMatchObject({ paddingBottom: 216 });
  });
});
