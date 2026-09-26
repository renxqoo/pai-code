import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ToolDetailSheet } from '@/features/chat/tool-detail-sheet';
import { ToolRow, toolRowLabel } from '@/features/chat/tool-row';
import { StatusLine } from '@/features/chat/status-line';
import { ThinkingRow } from '@/features/chat/thinking-row';
import { ToolGroup } from '@/features/chat/tool-group';
import type { ChatMessage } from '@/types/domain';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

type MessageValues = Pick<ChatMessage, 'id' | 'kind'> & Partial<Omit<ChatMessage, 'id' | 'kind'>>;
const message = (values: MessageValues): ChatMessage => ({ text: values.id, createdAt: 'now', ...values });

describe('toolRowLabel', () => {
  it('joins action with summary and degrades missing halves safely', () => {
    expect(toolRowLabel(message({ id: 't', kind: 'tool', title: '写入文件', summary: 'package.json' }))).toBe('写入文件  package.json');
    expect(toolRowLabel(message({ id: 't', kind: 'tool', title: '写入文件' }))).toBe('写入文件');
    expect(toolRowLabel(message({ id: 't', kind: 'tool', summary: 'package.json' }))).toBe('package.json');
    expect(toolRowLabel(message({ id: 't', kind: 'tool', title: '   ', summary: '  ' }))).toBe('执行操作');
    // T50：行内绝不透出命令原文/绝对路径（text 只进详情弹窗）
    const raw = message({ id: 't', kind: 'tool', title: '运行命令', summary: '检查 Node 环境', text: 'cd /Users/wrr/work && sed -n 1,60p app.tsx' });
    expect(toolRowLabel(raw)).toBe('运行命令  检查 Node 环境');
    expect(toolRowLabel(raw)).not.toContain('/Users/');
    expect(toolRowLabel(raw)).not.toContain('&&');
  });
});

describe('ToolDetailSheet', () => {
  it('renders full execution content in the shared bottom sheet and closes via store', async () => {
    useNavigationStore.setState({ toolDetail: null });
    const empty = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(empty.queryByText('工具执行详情')).toBeNull();
    const detail = message({
      id: 't',
      kind: 'tool',
      title: '运行命令',
      summary: '检查 Node 环境',
      text: 'cd /Users/wrr/work && bun test',
      status: 'success',
      durationMs: 1500,
    });
    await act(() => Promise.resolve(useNavigationStore.getState().openToolDetail(detail)));
    const view = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    // 与任务配置同构：底部 Sheet + 标题 + 分区图标标题（Sheet 标题与分区标题同为 header 语义）
    expect(view.getByText('工具执行详情')).toBeTruthy();
    expect(view.getAllByRole('header').length).toBeGreaterThanOrEqual(2);
    expect(view.getByText('运行命令')).toBeTruthy();
    expect(view.getByText('检查 Node 环境')).toBeTruthy();
    expect(view.getByText('cd /Users/wrr/work && bun test')).toBeTruthy();
    expect(view.getByText('共工作 1s')).toBeTruthy();
    expect(view.getByText('完整命令与输出仅供查证，不在消息列表展示。')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('关闭'));
    expect(useNavigationStore.getState().toolDetail).toBeNull();
  });

  it('degrades blank metadata without noise', async () => {
    await act(() => Promise.resolve(useNavigationStore.getState().openToolDetail(message({ id: 't', kind: 'tool', durationMs: Number.NaN }))));
    const view = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(view.getByText('执行操作')).toBeTruthy();
    expect(view.queryByText(/共工作/)).toBeNull();
    expect(view.queryByText('undefined')).toBeNull();
    await act(() => Promise.resolve(useNavigationStore.getState().closeToolDetail()));
  });
});

describe('StatusLine and ThinkingRow edge shapes', () => {
  it('falls back across blank halves and highlights failures', async () => {
    const fallback = await render(<StatusLine message={message({ id: 's', kind: 'status', text: '   ', summary: '  ' })} />);
    expect(fallback.toJSON()).toBeTruthy();
    const failed = await render(<StatusLine message={message({ id: 's', kind: 'status', text: '构建失败', summary: '退出码 1', status: 'error' })} />);
    expect(failed.getByText('构建失败')).toBeTruthy();
    expect(failed.getByText('退出码 1')).toBeTruthy();
  });

  it('falls back to the generic action label for untitled running tools in groups', async () => {
    const view = await render(<ToolGroup messages={[message({ id: 'g1', kind: 'tool', status: 'running' }), message({ id: 'g2', kind: 'tool', status: 'success' })]} onOpen={jest.fn()} />);
    expect(view.getByText(/执行中 · 执行操作/)).toBeTruthy();
  });

  it('keeps row arrows hugging the label instead of pinning right', async () => {
    const tool = await render(<ToolRow message={message({ id: 't', kind: 'tool', title: '读取', summary: 'a.ts', status: 'success' })} onOpen={jest.fn()} />);
    const row = tool.getByLabelText('查看工具详情：读取  a.ts');
    const rowStyle = row.props.style;
    expect(rowStyle.flexDirection).toBe('row');
    // 文本 flexShrink 收缩（非 flex:1 撑满），箭头紧跟文字
    const label = tool.getByText('读取  a.ts');
    expect(label.props.style.flex).toBeUndefined();
    expect(label.props.style.flexShrink).toBe(1);
    expect(label.props.style.marginRight).toBe(6);
  });

  it('exposes press feedback states on rows', () => {
    expect(rowPressStyle({ pressed: true })).toMatchObject({ opacity: 0.62, minHeight: 44 });
    expect(rowPressStyle({ pressed: false })).toMatchObject({ opacity: 1, minHeight: 44 });
  });

  it('expands and collapses thinking detail', async () => {
    const view = await render(<ThinkingRow message={message({ id: 'think', kind: 'thinking', text: '推理内容' })} />);
    expect(view.queryByText('推理内容')).toBeNull();
    await fireEvent.press(view.getByLabelText(/展开思考详情/));
    expect(view.getByText('推理内容')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/收起思考详情/));
    expect(view.queryByText('推理内容')).toBeNull();
  });
});
