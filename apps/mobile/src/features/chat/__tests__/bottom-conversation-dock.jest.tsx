import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { BottomConversationDock } from '@/features/chat/bottom-conversation-dock';

describe('BottomConversationDock', () => {
  it('renders a single compact composer shell', async () => {
    const view = await render(<BottomConversationDock />);
    expect(view.getByLabelText('消息输入框')).toBeTruthy();
    expect(view.getByLabelText('添加附件')).toBeTruthy();
    expect(view.getByLabelText('发送消息')).toBeTruthy();
    expect(view.queryByLabelText('上下文已使用 24%')).toBeNull();
    expect(view.queryByLabelText('模型与思考')).toBeNull();
    const composer = view.getByTestId('compact-composer');
    expect(composer.props.style).toMatchObject({ borderRadius: 0 });
    expect(composer.props.style).not.toHaveProperty('shadowColor');
  });

  it('keeps the embedded composer transparent inside the dock', async () => {
    const view = await render(<BottomConversationDock />);
    expect(view.getByTestId('compact-composer').props.style).toMatchObject({ borderRadius: 0 });
  });
});
