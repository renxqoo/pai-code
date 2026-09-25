import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { ChatScreen } from '@/features/chat/chat-screen';
import { demoSessions } from '@/fixtures/demo-data';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

describe('ChatScreen', () => {
  beforeEach(() => {
    useConversationStore.getState().startNewSession();
    useNavigationStore.setState({ drawerOpen: false, sheet: null, tab: 'chat' });
  });

  it('renders empty chat and opens workspace', async () => {
    const view = await render(<TestWrapper><ChatScreen /></TestWrapper>);
    await fireEvent.press(view.getByText('选择工作空间'));
    expect(useNavigationStore.getState().sheet).toBe('workspace');
  });

  it('renders an existing conversation and composer', async () => {
    const session = demoSessions[0];
    if (session === undefined) throw new Error('fixture missing');
    useConversationStore.getState().openSession(session);
    const view = await render(<TestWrapper><ChatScreen /></TestWrapper>);
    expect(view.getByText(session.messages[0]?.text ?? '')).toBeTruthy();
    expect(view.getByLabelText('消息输入框')).toBeTruthy();
  });
});
