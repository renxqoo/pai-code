import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ToolDetailSheet } from '@/features/chat/tool-detail-sheet';
import { toolRowLabel } from '@/features/chat/tool-row';
import { StatusLine } from '@/features/chat/status-line';
import { ThinkingRow } from '@/features/chat/thinking-row';
import { ToolGroup } from '@/features/chat/tool-group';
import type { ChatMessage } from '@/types/domain';
import { rowPressStyle } from '@/components/ui/row-press-style';

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
  it('renders full execution content and swallows close when message is absent', async () => {
    const onClose = jest.fn();
    const empty = await render(<ToolDetailSheet message={null} onClose={onClose} />);
    expect(empty.toJSON()).toBeNull();
    const detail = message({
      id: 't',
      kind: 'tool',
      title: '运行命令',
      summary: '检查 Node 环境',
      text: 'cd /Users/wrr/work && bun test',
      status: 'success',
      durationMs: 1500,
    });
    const view = await render(<ToolDetailSheet message={detail} onClose={onClose} />);
    expect(view.getByText('运行命令')).toBeTruthy();
    expect(view.getByText('检查 Node 环境')).toBeTruthy();
    expect(view.getByText('cd /Users/wrr/work && bun test')).toBeTruthy();
    expect(view.getByText('共工作 1s')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('关闭工具详情'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('degrades blank metadata without noise', async () => {
    const view = await render(<ToolDetailSheet message={message({ id: 't', kind: 'tool', durationMs: Number.NaN })} onClose={jest.fn()} />);
    expect(view.getByText('执行操作')).toBeTruthy();
    expect(view.queryByText(/共工作/)).toBeNull();
    expect(view.queryByText('undefined')).toBeNull();
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
