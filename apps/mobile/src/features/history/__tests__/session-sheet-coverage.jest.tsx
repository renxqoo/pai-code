import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { testSession } from '@/test/session-fixture';
import { SessionSheet } from '@/features/history/session-sheet';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

const SESSIONS = [
  testSession('session-refactor', { title: '优化移动端对话时间线' }),
  testSession('session-mobile', { title: 'X3code Mobile 视觉走查' }),
];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe('SessionSheet actions', () => {
  beforeEach(() => {
    useHistoryStore.setState({ sessions: SESSIONS, query: '' });
    useNavigationStore.setState({ drawerOpen: false, sheet: null });
  });

  it('archives and deletes through the active session sheet', async () => {
    const session = SESSIONS[1];
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
