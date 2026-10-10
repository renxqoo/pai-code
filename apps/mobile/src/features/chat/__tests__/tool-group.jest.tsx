import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ToolBatch } from '@/features/chat/tool-batch';
import { ToolGroup } from '@/features/chat/tool-group';
import { ToolGroupHeader } from '@/features/chat/tool-group-header';
import { FileDiffSection } from '@/features/chat/file-diff-section';
import { FileDiffSheet } from '@/features/chat/file-diff-sheet';
import { DiffLines } from '@/features/chat/diff-lines';
import type { ChatMessage } from '@/types/domain';
import type { FileDiffGroup } from '@x3code/ui-thread';
import { lightColors } from '@/theme/colors';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

type MessageValues = Pick<ChatMessage, 'id' | 'kind'> & Partial<Omit<ChatMessage, 'id' | 'kind'>>;
const message = (values: MessageValues): ChatMessage => ({ text: values.id, createdAt: 'now', ...values });

/** diff 行的底色（行容器的内联样式）；节点缺失降级为无底色。 */
const backgroundOf = (node: { props: { style?: unknown } } | null): string | undefined => {
  const style = (node === null ? undefined : node.props.style) as { backgroundColor?: string } | undefined;
  return style?.backgroundColor;
};

const editTool = (id: string, path: string, oldText = 'a', newText = 'b', status: 'ok' | 'failed' = 'ok'): ChatMessage =>
  message({ id, kind: 'tool', toolName: 'edit', status, argsPreview: path, editHunks: [{ path, oldText, newText }] });

describe('ToolBatch 批次装配', () => {
  it('单调用不套组头：直接一个执行行（无并行可言）', async () => {
    const view = await render(<ToolBatch messages={[message({ id: 't1', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', status: 'ok' })]} onOpen={jest.fn()} onOpenDiff={jest.fn()} />);
    expect(view.getByText('已运行')).toBeTruthy();
    expect(view.queryByLabelText(/展开工具组/)).toBeNull();
  });

  it('空批次不渲染空壳', async () => {
    const view = await render(<ToolBatch messages={[]} onOpen={jest.fn()} onOpenDiff={jest.fn()} />);
    expect(view.toJSON()).toBeNull();
  });

  it('组头标题合成空缺退化为通用动作（垃圾输入不显空标题、不崩溃）', async () => {
    const view = await render(<ToolGroupHeader views={[]} open={false} onToggle={jest.fn()} />);
    expect(view.getByText('执行操作')).toBeTruthy();
  });

  it('单一类别桶的组头图标取该桶语义（全是编辑 → 铅笔）', async () => {
    const view = await render(
      <ToolGroup
        messages={[editTool('e1', 'src/a.ts'), editTool('e2', 'src/b.ts')]}
        onOpen={jest.fn()}
        onOpenDiff={jest.fn()}
      />,
    );
    expect(view.getByLabelText(/展开工具组：编辑了文件/)).toBeTruthy();
  });

  it('并行批次聚合成组头（文案与 PC 同源），收起态箭头常显', async () => {
    const view = await render(
      <ToolBatch
        messages={[
          editTool('e1', 'src/a.ts'),
          message({ id: 't1', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', status: 'ok' }),
        ]}
        onOpen={jest.fn()}
        onOpenDiff={jest.fn()}
      />,
    );
    expect(view.getByLabelText(/展开工具组：编辑了文件运行了命令/)).toBeTruthy();
    expect(view.queryByTestId('group-chevron', { includeHiddenElements: true })).toBeTruthy();
    // 收起态不渲染调用行
    expect(view.queryByText('已运行')).toBeNull();
    expect(view.queryByText('已编辑')).toBeNull();
  });

  it('未知工具进组头按原始名点名（不猜语义）', async () => {
    const view = await render(
      <ToolGroup
        messages={[
          message({ id: 't1', kind: 'tool', toolName: 'mcp__a', argsPreview: 'x', status: 'ok' }),
          message({ id: 't2', kind: 'tool', toolName: 'mcp__b', argsPreview: 'y', status: 'ok' }),
        ]}
        onOpen={jest.fn()}
        onOpenDiff={jest.fn()}
      />,
    );
    expect(view.getByLabelText(/展开工具组：调用了mcp__a调用了mcp__b/)).toBeTruthy();
  });

  it('点按组头展开/收起，手动意图优先于自动', async () => {
    const view = await render(
      <ToolGroup
        messages={[
          editTool('e1', 'src/a.ts'),
          message({ id: 't1', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', status: 'ok' }),
        ]}
        onOpen={jest.fn()}
        onOpenDiff={jest.fn()}
      />,
    );
    const header = view.getByLabelText(/展开工具组/);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    await fireEvent.press(header);
    expect(view.getByLabelText(/收起工具组/).props.accessibilityState).toEqual({ expanded: true });
    expect(view.getByText('已运行')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/收起工具组/));
    expect(view.getByLabelText(/展开工具组/).props.accessibilityState).toEqual({ expanded: false });
  });

  it('自动开合与 PC 端同口径（症状回归：并行组合并时先开后关闪一下）：只有失败自动展开，运行中收起', async () => {
    const running = await render(
      <ToolGroup
        messages={[editTool('e1', 'src/a.ts'), message({ id: 't1', kind: 'tool', toolName: 'bash', argsPreview: 'x', status: 'running' })]}
        onOpen={jest.fn()}
        onOpenDiff={jest.fn()}
      />,
    );
    expect(running.getByLabelText(/展开工具组/).props.accessibilityState).toEqual({ expanded: false });

    const failed = await render(
      <ToolGroup
        messages={[editTool('e1', 'src/a.ts'), message({ id: 't1', kind: 'tool', toolName: 'bash', argsPreview: 'x', status: 'failed', exitCode: 1 })]}
        onOpen={jest.fn()}
        onOpenDiff={jest.fn()}
      />,
    );
    expect(failed.getByLabelText(/收起工具组/).props.accessibilityState).toEqual({ expanded: true });
    expect(failed.getByText('运行失败')).toBeTruthy();
    expect(failed.getByText('退出码 1')).toBeTruthy();
  });
});

describe('文件级 diff 归并（同一文件多次编辑合成一个 diff）', () => {
  it('同路径两次编辑合成一个入口行，行与执行行同形态（已编辑 + 文件名）', async () => {
    const onOpen = jest.fn();
    const view = await render(
      <FileDiffSection messages={[editTool('e1', 'src/a.ts', 'x', 'y'), editTool('e2', 'src/a.ts', 'p', 'q')]} onOpen={onOpen} />,
    );
    expect(view.getAllByText('已编辑')).toHaveLength(1);
    expect(view.getByText('a.ts')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('查看改动详情：a.ts'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/a.ts' }));
  });

  it('失败/运行中的编辑不挂 diff 入口（只报「已改成的」，不报「想改的」）', async () => {
    const view = await render(<FileDiffSection messages={[editTool('e1', 'src/a.ts', 'x', 'y', 'failed')]} onOpen={jest.fn()} />);
    expect(view.queryByText('已编辑')).toBeNull();
  });

  it('缺 path 的补丁不归并（各自成组，未知文件有占位文案）', async () => {
    const view = await render(<FileDiffSection messages={[editTool('e1', ''), editTool('e2', '')]} onOpen={jest.fn()} />);
    expect(view.getAllByText('未知文件')).toHaveLength(2);
  });

  it('Sheet 内红绿行对照：删除行红底、新增行绿底，多段补丁段间分隔', async () => {
    const group: FileDiffGroup = {
      path: 'src/a.ts',
      hunks: [
        { path: 'src/a.ts', oldText: 'const a = 1;', newText: 'const a = 2;' },
        { path: 'src/a.ts', oldText: 'const b = 3;', newText: 'const b = 4;' },
      ],
    };
    const lines = await render(<DiffLines hunks={group.hunks} />);
    expect(lines.getByText('const a = 1;')).toBeTruthy();
    expect(lines.getByText('const a = 2;')).toBeTruthy();
    expect(lines.getAllByText('+')).toHaveLength(2);
    expect(lines.getAllByText('-')).toHaveLength(2);
    const removed = lines.getByText('const a = 1;');
    expect(backgroundOf(removed.parent)).toBe(lightColors.diffDelSoft);
    const added = lines.getByText('const b = 4;');
    expect(backgroundOf(added.parent)).toBe(lightColors.diffAddSoft);
  });

  it('Sheet 头显文件名与路径，空片段不渲染空壳', async () => {
    useNavigationStore.setState({ fileDiff: null });
    const empty = await render(<TestWrapper><FileDiffSheet /></TestWrapper>);
    expect(empty.queryByText('改动详情')).toBeNull();
    await act(() =>
      Promise.resolve(
        useNavigationStore.getState().openFileDiff({ path: 'src/features/chat/tool-row.tsx', hunks: [{ path: 'src/features/chat/tool-row.tsx', oldText: 'a', newText: 'b' }] }),
      ),
    );
    const view = await render(<TestWrapper><FileDiffSheet /></TestWrapper>);
    expect(view.getByText('改动详情')).toBeTruthy();
    expect(view.getByText('tool-row.tsx')).toBeTruthy();
    expect(view.getByText('src/features/chat/tool-row.tsx')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('关闭'));
    expect(useNavigationStore.getState().fileDiff).toBeNull();
  });

  it('空片段（无原文无新文）落中性占位行，不渲染空壳', async () => {
    const plain = await render(<DiffLines hunks={[{ path: 'a.ts', oldText: '', newText: '' }]} />);
    expect(plain.toJSON()).toBeTruthy();
    expect(plain.queryByText('+')).toBeNull();
    expect(plain.queryByText('-')).toBeNull();
    const nothing = await render(<DiffLines hunks={[]} />);
    expect(nothing.toJSON()).toBeNull();
  });
});
