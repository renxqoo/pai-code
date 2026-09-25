import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { CodeBlock } from '@/features/chat/code-block';
import { MessageItem } from '@/features/chat/message-item';
import { StatusRow } from '@/features/chat/status-row';
import { ToolBlock } from '@/features/chat/tool-block';
import { ThinkingBlock } from '@/features/chat/thinking-block';
import { formatTimelineDuration } from '@/features/chat/timeline-duration';
import type { ChatMessage } from '@/types/domain';

type MessageValues = Pick<ChatMessage, 'id' | 'kind' | 'text'> & Partial<Omit<ChatMessage, 'id' | 'kind' | 'text'>>;
const message = (values: MessageValues): ChatMessage => ({ createdAt: 'now', ...values });

describe('timeline components', () => {
  it('renders message fallbacks for every message kind', async () => {
    const view = await render(<><MessageItem message={message({ id: 'user', kind: 'user', text: '用户' })} /><MessageItem message={message({ id: 'system', kind: 'system', text: '系统' })} /><MessageItem message={message({ id: 'think', kind: 'thinking', text: '思考' })} /><MessageItem message={message({ id: 'tool', kind: 'tool', text: '工具' })} /><MessageItem message={message({ id: 'status', kind: 'status', text: '完成' })} /></>);
    expect(view.getByText('用户')).toBeTruthy();
    expect(view.getByText('系统')).toBeTruthy();
    expect(view.getByText('思考过程')).toBeTruthy();
    expect(view.getByText('执行完成')).toBeTruthy();
    expect(view.getByText('完成')).toBeTruthy();
  });

  it('groups and expands multiple thinking steps', async () => {
    const block = { kind: 'thinking' as const, key: 'thinking', messages: [message({ id: 'think-1', kind: 'thinking', text: '第一步' }), message({ id: 'think-2', kind: 'thinking', text: '第二步' })] };
    const view = await render(<ThinkingBlock block={block} />);
    expect(view.getByText('2 步')).toBeTruthy();
    expect(view.queryByText('第一步')).toBeNull();
    await fireEvent.press(view.getByLabelText('展开或收起思考过程'));
    expect(view.getByText('第一步')).toBeTruthy();
    expect(view.getByText('第二步')).toBeTruthy();
  });

  it('truncates long code, expands and collapses with fallback metadata', async () => {
    const long = message({ id: 'code', kind: 'code', text: '1\n2\n3\n4\n5\n6\n7' });
    const view = await render(<CodeBlock message={long} />);
    expect(view.getByText('代码')).toBeTruthy();
    expect(view.getByText('text')).toBeTruthy();
    expect(view.getByText('展开剩余 2 行')).toBeTruthy();
    await fireEvent.press(view.getByText('代码'));
    expect(view.getByText('收起代码')).toBeTruthy();
    await fireEvent.press(view.getByText('收起代码'));
    expect(view.getByText('展开剩余 2 行')).toBeTruthy();
    const short = await render(<CodeBlock message={message({ id: 'short', kind: 'code', text: 'only', title: 'app.ts', language: 'ts' })} />);
    expect(short.queryByText(/展开剩余/)).toBeNull();
  });

  it('renders running, success and error status rows with optional metadata', async () => {
    const view = await render(<><StatusRow message={message({ id: 'running', kind: 'status', text: '运行中' })} /><StatusRow message={message({ id: 'success', kind: 'status', status: 'success', text: '完成', summary: '通过', durationMs: 1200 })} /><StatusRow message={message({ id: 'error', kind: 'status', status: 'error', text: '失败' })} /></>);
    expect(view.getByText('运行中')).toBeTruthy();
    expect(view.getByText('通过')).toBeTruthy();
    expect(view.getByText('1.2s')).toBeTruthy();
    expect(view.getByText('失败')).toBeTruthy();
  });

  it('renders completed, running and failed tool blocks with expanded details', async () => {
    const completed = { kind: 'tools' as const, key: 'done', messages: [message({ id: 'done-tool', kind: 'tool', title: '完成工具', text: '结果', status: 'success', durationMs: 500 })] };
    const running = { kind: 'tools' as const, key: 'running', messages: [message({ id: 'running-tool', kind: 'tool', text: '继续运行', status: 'running' })] };
    const failed = { kind: 'tools' as const, key: 'failed', messages: [message({ id: 'failed-tool', kind: 'tool', text: '失败', status: 'error' })] };
    const view = await render(<><ToolBlock block={completed} /><ToolBlock block={running} /><ToolBlock block={failed} /></>);
    expect(view.getByText('执行完成')).toBeTruthy();
    expect(view.getByText('执行过程')).toBeTruthy();
    expect(view.getByText('执行失败')).toBeTruthy();
    const controls = view.getAllByLabelText('展开或收起执行过程');
    const completedControl = controls[0];
    const runningControl = view.getAllByLabelText('展开或收起执行过程')[1];
    if (completedControl === undefined || runningControl === undefined) throw new Error('tool controls missing');
    await fireEvent.press(completedControl);
    expect(view.getByText('完成工具')).toBeTruthy();
    await fireEvent.press(runningControl);
    expect(view.getByText('继续运行')).toBeTruthy();
  });

  it('formats duration boundaries safely', () => {
    expect(formatTimelineDuration(-10)).toBe('0ms');
    expect(formatTimelineDuration(999)).toBe('999ms');
    expect(formatTimelineDuration(1500)).toBe('1.5s');
    expect(formatTimelineDuration(12_000)).toBe('12s');
  });
});
