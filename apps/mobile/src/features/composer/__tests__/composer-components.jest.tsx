import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { ComposerPanel } from '@/features/composer/composer-panel';
import { TaskSettingsSheet } from '@/features/composer/task-settings-sheet';
import { PermissionSheet } from '@/features/composer/permission-sheet';
import { ContextSheet } from '@/features/composer/context-sheet';
import { useAttachmentStore } from '@/store/attachment-store';
import { useComposerStore } from '@/store/composer-store';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

describe('composer components', () => {
  beforeEach(() => {
    useComposerStore.setState({ draft: '', model: 'gpt-5.2-codex', thinking: 'medium', permission: 'ask', sending: false, generating: false, contextPercent: 24 });
    useAttachmentStore.setState({ items: [] });
    useConversationStore.getState().startNewSession();
    useNavigationStore.setState({ drawerOpen: false, sheet: null, tab: 'chat' });
  });

  it('edits and sends a draft', async () => {
    const view = await render(<ComposerPanel />);
    await fireEvent.changeText(view.getByLabelText('消息输入框'), '检查 Android 构建');
    await fireEvent.press(view.getByLabelText('发送消息'));
    expect(useComposerStore.getState().draft).toBe('');
    expect(useConversationStore.getState().session.messages[0]?.text).toBe('检查 Android 构建');
  });

  it('keeps attachment and permission left, with context, model and send grouped right', async () => {
    const view = await render(<ComposerPanel />);
    expect(view.getByLabelText('添加附件')).toBeTruthy();
    expect(view.getByLabelText('权限模式：每次询问')).toBeTruthy();
    expect(view.getByLabelText('上下文已使用 24%').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 24 });
    expect(view.getByLabelText('模型与思考')).toBeTruthy();
    expect(view.getByLabelText('发送消息')).toBeTruthy();
    expect(view.queryByText('GPT-5.2 Codex')).toBeNull();
    expect(view.queryByText('每次询问')).toBeNull();
  });

  it('opens model and thinking settings separately from permission and context', async () => {
    const view = await render(<TestWrapper><><ComposerPanel /><TaskSettingsSheet /><PermissionSheet /><ContextSheet /></></TestWrapper>);
    await fireEvent.press(view.getByLabelText('模型与思考'));
    expect(useNavigationStore.getState().sheet).toBe('task-settings');
    await fireEvent.changeText(view.getByLabelText('搜索模型'), 'Claude');
    await fireEvent.press(view.getByText('Claude Sonnet 5'));
    await fireEvent.press(view.getByText('高'));
    expect(useComposerStore.getState().thinking).toBe('high');
    expect(useComposerStore.getState()).toMatchObject({ model: 'claude-sonnet-5', thinking: 'high' });
    expect(view.getByLabelText('搜索模型').props.value).toBe('Claude');
    await fireEvent.press(view.getByLabelText('权限模式：每次询问'));
    expect(useNavigationStore.getState().sheet).toBe('permission');
    await fireEvent.press(view.getByText('仅规划'));
    expect(useComposerStore.getState().permission).toBe('plan');
    await fireEvent.press(view.getByLabelText('上下文已使用 24%'));
    expect(useNavigationStore.getState().sheet).toBe('context');
  });

  it('renders normal context usage in the context sheet', async () => {
    useNavigationStore.getState().openSheet('context');
    const view = await render(<TestWrapper><ContextSheet /></TestWrapper>);
    expect(view.getByText('24%')).toBeTruthy();
  });

  it('shows high context usage in the context sheet', async () => {
    useComposerStore.getState().setContextPercent(91);
    useNavigationStore.getState().openSheet('context');
    const view = await render(<TestWrapper><ContextSheet /></TestWrapper>);
    expect(view.getByText('91%')).toBeTruthy();
  });

  it('removes an attachment and stops generation', async () => {
    useAttachmentStore.getState().addAttachment({ id: '1', name: 'a.pdf', size: 100, kind: 'pdf', status: 'ready' });
    useComposerStore.getState().setDraft('内容');
    const view = await render(<ComposerPanel />);
    await fireEvent.press(view.getByLabelText('移除 a.pdf'));
    expect(useAttachmentStore.getState().items).toHaveLength(0);
    await act(() => Promise.resolve(useAttachmentStore.getState().addAttachment({ id: '2', name: 'b.pdf', size: 100, kind: 'pdf', status: 'ready' })));
    await view.rerender(<TestWrapper><ComposerPanel /></TestWrapper>);
    await fireEvent.press(view.getByLabelText('发送消息'));
    expect(useAttachmentStore.getState().items).toHaveLength(0);
    await act(() => Promise.resolve(useComposerStore.setState({ generating: true })));
    await view.rerender(<TestWrapper><ComposerPanel /></TestWrapper>);
    await fireEvent.press(view.getByLabelText('停止生成'));
    expect(useComposerStore.getState().generating).toBe(false);
  });
});
