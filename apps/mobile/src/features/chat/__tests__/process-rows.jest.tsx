import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ThinkingRow } from '@/features/chat/thinking-row';
import { StatusLine } from '@/features/chat/status-line';
import { MessageItem } from '@/features/chat/message-item';
import { StreamItems } from '@/features/chat/stream-items';
import type { ChatMessage } from '@/types/domain';

type MessageValues = Pick<ChatMessage, 'id' | 'kind'> & Partial<Omit<ChatMessage, 'id' | 'kind'>>;
const message = (values: MessageValues): ChatMessage => ({ text: values.id, createdAt: 'now', ...values });

describe('ThinkingRow 思考单元', () => {
  it('收起显正文预览，点按展开详情；箭头常显（触屏无 hover）', async () => {
    const view = await render(<ThinkingRow message={message({ id: 't', kind: 'thinking', text: '先摸清页面骨架再定方案' })} />);
    expect(view.getByText('思考')).toBeTruthy();
    expect(view.getByText('先摸清页面骨架再定方案')).toBeTruthy();
    expect(view.queryByTestId('thinking-chevron', { includeHiddenElements: true })).toBeTruthy();
    const header = view.getByLabelText(/展开思考详情/);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    await fireEvent.press(header);
    expect(view.getByLabelText(/收起思考详情/).props.accessibilityState).toEqual({ expanded: true });
  });

  it('运行中挂 spinner 并带流光（深度思考进行中可见）', async () => {
    const view = await render(<ThinkingRow message={message({ id: 't', kind: 'thinking', text: '推理中', status: 'running' })} />);
    expect(view.queryByTestId('thinking-spinner', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText('思考')).toBeTruthy();
  });
});

describe('StatusLine 状态信封行', () => {
  it('成功弱化一行可见，失败红色整句 + 补充摘要', async () => {
    const ok = await render(<StatusLine message={message({ id: 's', kind: 'status', text: '基线走查完成', summary: '390×844 无横向溢出', status: 'ok' })} />);
    expect(ok.getByText('基线走查完成')).toBeTruthy();
    expect(ok.getByText('390×844 无横向溢出')).toBeTruthy();

    const failed = await render(<StatusLine message={message({ id: 's', kind: 'status', text: '构建失败', summary: '退出码 1', status: 'failed' })} />);
    expect(failed.getByText('构建失败')).toBeTruthy();
    expect(failed.getByText('退出码 1')).toBeTruthy();
  });

  it('运行中状态行挂 spinner', async () => {
    const view = await render(<StatusLine message={message({ id: 's', kind: 'status', text: '打包中', status: 'running' })} />);
    expect(view.queryByTestId('status-spinner', { includeHiddenElements: true })).toBeTruthy();
  });

  it('空文案降级为空行，不显悬空占位', async () => {
    const view = await render(<StatusLine message={message({ id: 's', kind: 'status', text: '   ', status: 'ok' })} />);
    expect(view.toJSON()).toBeTruthy();
    expect(view.queryByText(/undefined/)).toBeNull();
  });
});

describe('MessageItem 正文分派', () => {
  it('过程类消息（tool/thinking/status）不落正文渲染（各走专用行组件）', async () => {
    const view = await render(<MessageItem message={message({ id: 't', kind: 'tool', toolName: 'bash' })} />);
    expect(view.toJSON()).toBeNull();
  });
});

describe('过程流条目顺序（组头 / 执行行 / 思考）', () => {
  it('按过程流原始顺序装配：思考行 → 并行组 → 状态行', async () => {
    const view = await render(
      <StreamItems
        messages={[
          message({ id: 'think', kind: 'thinking', text: '想一想' }),
          message({ id: 't1', kind: 'tool', toolName: 'edit', status: 'ok', argsPreview: 'a.ts' }),
          message({ id: 't2', kind: 'tool', toolName: 'bash', status: 'ok', argsPreview: 'bun test' }),
          message({ id: 's1', kind: 'status', text: '阶段完成', status: 'ok' }),
        ]}
        onOpenTool={jest.fn()}
        onOpenDiff={jest.fn()}
      />,
    );
    const order = JSON.stringify(view.toJSON());
    const thinking = order.indexOf('展开思考详情');
    const group = order.indexOf('展开工具组');
    const status = order.indexOf('阶段完成');
    expect(thinking).toBeGreaterThanOrEqual(0);
    expect(group).toBeGreaterThan(thinking);
    expect(status).toBeGreaterThan(group);
    // 思考行与组头触控区同为 ≥44pt
    const header = view.getByLabelText(/展开思考详情/);
    const entries = (Array.isArray(header.props.style) ? header.props.style : [header.props.style]) as ReadonlyArray<{ minHeight?: number }>;
    expect(Math.max(0, ...entries.map((entry) => entry?.minHeight ?? 0))).toBeGreaterThanOrEqual(44);
  });
});
