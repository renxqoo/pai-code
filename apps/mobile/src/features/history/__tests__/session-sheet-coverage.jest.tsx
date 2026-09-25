import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { demoSessions } from '@/fixtures/demo-data';
import { SessionSheet } from '@/features/history/session-sheet';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe('SessionSheet actions', () => {
  beforeEach(() => {
    useHistoryStore.setState({ sessions: demoSessions, query: '', showArchived: false });
    useNavigationStore.setState({ drawerOpen: false, sheet: null, tab: 'chat' });
  });

  it('archives and deletes through the active session sheet', async () => {
    const session = demoSessions[1];
    if (session === undefined) throw new Error('fixture missing');
    useConversationStore.getState().openSession(session);
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('session-actions')));
    const view = await render(<TestWrapper><SessionSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('归档'));
    expect(useHistoryStore.getState().sessions.find((item) => item.id === session.id)?.archived).toBe(true);
    await act(() => Promise.resolve(useNavigationStore.getState().openSheet('session-actions')));
    await view.rerender(<TestWrapper><SessionSheet /></TestWrapper>);
    await fireEvent.press(view.getByText('删除'));
    expect(useHistoryStore.getState().sessions.some((item) => item.id === session.id)).toBe(false);
  });
});
