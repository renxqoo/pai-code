import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { ChatHeader } from '@/features/chat/chat-header';
import { ComposerPanel } from '@/features/composer/composer-panel';
import { TaskConfigSheet } from '@/features/composer/task-config-sheet';
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

  it('edits and sends a draft from the compact input', async () => {
    const view = await render(<ComposerPanel />);
    expect(view.getByPlaceholderText('尽管问，带图也行')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('消息输入框'), '检查 Android 构建');
    await fireEvent.press(view.getByLabelText('发送消息'));
    expect(useComposerStore.getState().draft).toBe('');
    expect(useConversationStore.getState().session.messages[0]?.text).toBe('检查 Android 构建');
  });

  it('keeps only attachment and send controls in the input area', async () => {
    const view = await render(<ComposerPanel />);
    expect(view.getByLabelText('添加附件')).toBeTruthy();
    expect(view.getByLabelText('发送消息')).toBeTruthy();
    expect(view.queryByLabelText('任务配置')).toBeNull();
    expect(view.queryByLabelText('权限模式：每次询问')).toBeNull();
    expect(view.queryByLabelText('上下文已使用 24%')).toBeNull();
    expect(view.queryByLabelText('模型与思考')).toBeNull();
  });

  it('expands on focus and returns to the compact capsule on blur', async () => {
    const view = await render(<ComposerPanel />);
    expect(view.getByTestId('compact-composer')).toBeTruthy();
    expect(view.queryByTestId('focused-composer')).toBeNull();
    await fireEvent(view.getByLabelText('消息输入框'), 'focus');
    expect(view.queryByTestId('compact-composer')).toBeNull();
    expect(view.getByTestId('focused-composer')).toBeTruthy();
    expect(view.getByTestId('focused-composer').props.style).toMatchObject({ minHeight: 132 });
    await fireEvent(view.getByLabelText('消息输入框'), 'blur');
    expect(view.getByTestId('compact-composer')).toBeTruthy();
    expect(view.queryByTestId('focused-composer')).toBeNull();
  });

  it('opens attachments and removes a selected file', async () => {
    useAttachmentStore.getState().addAttachment({ id: '1', name: 'a.pdf', size: 100, kind: 'pdf', status: 'ready' });
    const view = await render(<ComposerPanel />);
    await fireEvent.press(view.getByLabelText('添加附件'));
    expect(useNavigationStore.getState().sheet).toBe('attachments');
    await fireEvent.press(view.getByLabelText('移除 a.pdf'));
    expect(useAttachmentStore.getState().items).toHaveLength(0);
  });

  it('configures model, thinking, permission and context in one panel', async () => {
    const view = await render(<TestWrapper><><ChatHeader /><TaskConfigSheet /></></TestWrapper>);
    await fireEvent.press(view.getByLabelText('任务配置'));
    await fireEvent.changeText(view.getByLabelText('搜索模型'), 'Claude');
    await fireEvent.press(view.getByText('Claude Sonnet 5'));
    await fireEvent.press(view.getByText('高'));
    await fireEvent.press(view.getByText('仅规划'));
    expect(useComposerStore.getState()).toMatchObject({ model: 'claude-sonnet-5', thinking: 'high', permission: 'plan' });
    expect(view.getByText('上下文 · 24%')).toBeTruthy();
  });

  it('shows high context risk and default configuration guidance', async () => {
    useComposerStore.getState().setContextPercent(91);
    const view = await render(<TestWrapper><><ChatHeader /><TaskConfigSheet /></></TestWrapper>);
    await fireEvent.press(view.getByLabelText('任务配置'));
    expect(view.getByText('上下文 · 91%')).toBeTruthy();
    expect(view.getByText('配置应用于当前对话；默认配置可在个人设置中调整。')).toBeTruthy();
  });

  it('removes attachments and stops generation', async () => {
    useAttachmentStore.getState().addAttachment({ id: '1', name: 'a.pdf', size: 100, kind: 'pdf', status: 'ready' });
    useComposerStore.getState().setDraft('内容');
    const view = await render(<ComposerPanel />);
    await fireEvent.press(view.getByLabelText('移除 a.pdf'));
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
