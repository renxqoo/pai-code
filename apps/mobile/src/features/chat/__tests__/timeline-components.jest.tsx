import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { CodeBlock } from '@/features/chat/code-block';
import { MessageItem } from '@/features/chat/message-item';
import type { ChatMessage } from '@/types/domain';

type MessageValues = Pick<ChatMessage, 'id' | 'kind' | 'text'> & Partial<Omit<ChatMessage, 'id' | 'kind' | 'text'>>;
const message = (values: MessageValues): ChatMessage => ({ createdAt: 'now', ...values });

describe('timeline components', () => {
  it('renders user, assistant, system and code content messages', async () => {
    const view = await render(
      <>
        <MessageItem message={message({ id: 'user', kind: 'user', text: '用户' })} />
        <MessageItem message={message({ id: 'assistant', kind: 'assistant', text: '助手' })} />
        <MessageItem message={message({ id: 'system', kind: 'system', text: '系统' })} />
        <MessageItem message={message({ id: 'code', kind: 'code', text: '代码内容' })} />
      </>,
    );
    expect(view.getByText('用户')).toBeTruthy();
    const bubble = view.getByTestId('user-task-card');
    // T50：用户气泡自适应宽（上限 86%）贴右、有背景、文字自然换行不逐行居右
    expect(bubble.props.style).toMatchObject({ maxWidth: '86%', minWidth: 72 });
    expect(bubble.props.style.backgroundColor).toBeDefined();
    expect(bubble.props.style.borderRadius).toBeDefined();
    expect(view.getByText('用户').props.style.textAlign).not.toBe('right');
    expect(bubble.parent?.props.style).toMatchObject({ alignItems: 'flex-end' });
    expect(view.getByText('助手')).toBeTruthy();
    expect(view.getByText('系统')).toBeTruthy();
    expect(view.getByText('代码内容')).toBeTruthy();
  });

  it('truncates long code, expands and collapses with fallback metadata', async () => {
    const view = await render(<CodeBlock code={'1\n2\n3\n4\n5\n6\n7'} />);
    expect(view.getByText('代码')).toBeTruthy();
    expect(view.getByText('text')).toBeTruthy();
    expect(view.getByText('展开剩余 2 行')).toBeTruthy();
    await fireEvent.press(view.getByText('代码'));
    expect(view.getByText('收起代码')).toBeTruthy();
    await fireEvent.press(view.getByText('收起代码'));
    expect(view.getByText('展开剩余 2 行')).toBeTruthy();
    const short = await render(<CodeBlock code="only" language="ts" lineCount={1} title="app.ts" />);
    expect(short.queryByText(/展开剩余/)).toBeNull();
  });

  it('renders a blank code artifact safely without duration noise', async () => {
    const view = await render(<CodeBlock code="" />);
    expect(view.queryByText('0ms')).toBeNull();
    expect(view.getByText('代码')).toBeTruthy();
  });
});
