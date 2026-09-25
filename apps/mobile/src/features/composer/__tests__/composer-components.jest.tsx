import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { ComposerPanel } from '@/features/composer/composer-panel';
import { PickerSheet } from '@/features/composer/picker-sheet';
import { useAttachmentStore } from '@/store/attachment-store';
import { useComposerStore } from '@/store/composer-store';
import { useConversationStore } from '@/store/conversation-store';
import { TestWrapper } from '@/test/test-wrapper';

describe('composer components', () => {
  beforeEach(() => {
    useComposerStore.setState({ draft: '', model: 'gpt-5.2-codex', thinking: 'medium', permission: 'ask', picker: null, sending: false, generating: false, contextPercent: 24 });
    useAttachmentStore.setState({ items: [] });
    useConversationStore.getState().startNewSession();
  });

  it('edits and sends a draft', async () => {
    const view = await render(<ComposerPanel />);
    await fireEvent.changeText(view.getByLabelText('消息输入框'), '检查 Android 构建');
    await fireEvent.press(view.getByLabelText('发送消息'));
    expect(useComposerStore.getState().draft).toBe('');
    expect(useConversationStore.getState().session.messages[0]?.text).toBe('检查 Android 构建');
  });

  it('opens and selects model', async () => {
    const view = await render(<TestWrapper><><ComposerPanel /><PickerSheet /></></TestWrapper>);
    await fireEvent.press(view.getByLabelText('GPT-5.2 Codex'));
    await fireEvent.press(view.getByText('Claude Sonnet 5'));
    expect(useComposerStore.getState().model).toBe('claude-sonnet-5');
  });

  it('selects thinking and permission', async () => {
    await act(() => Promise.resolve(useComposerStore.getState().openPicker('thinking')));
    const thinking = await render(<TestWrapper><PickerSheet /></TestWrapper>);
    await fireEvent.press(thinking.getByText('高'));
    expect(useComposerStore.getState().thinking).toBe('high');
    await act(() => Promise.resolve(useComposerStore.getState().openPicker('permission')));
    const permission = await render(<TestWrapper><PickerSheet /></TestWrapper>);
    await fireEvent.press(permission.getByText('仅规划'));
    expect(useComposerStore.getState().permission).toBe('plan');
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
