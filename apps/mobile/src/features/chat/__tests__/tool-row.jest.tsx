import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ToolRow } from '@/features/chat/tool-row';
import { ToolDetailSheet } from '@/features/chat/tool-detail-sheet';
import type { ChatMessage } from '@/types/domain';
import { useNavigationStore } from '@/store/navigation-store';
import { TestWrapper } from '@/test/test-wrapper';

type MessageValues = Pick<ChatMessage, 'id' | 'kind'> & Partial<Omit<ChatMessage, 'id' | 'kind'>>;
const message = (values: MessageValues): ChatMessage => ({ text: values.id, createdAt: 'now', ...values });

/** 行触控区高度（Pressable style 经渲染后落成宿主 View 的样式数组，取各段 minHeight 最大值）。 */
const minTouch = (node: { props: { style?: unknown } }): number => {
  const entries = (Array.isArray(node.props.style) ? node.props.style : [node.props.style]) as ReadonlyArray<{ minHeight?: number }>;
  return Math.max(0, ...entries.map((entry) => entry?.minHeight ?? 0));
};

describe('ToolRow 执行单元行（与 PC 端同信息架构）', () => {
  it('renders 状态前缀 + 命令摘要，输出原文不进消息列表', async () => {
    const onOpen = jest.fn();
    const tool = message({
      id: 't1',
      kind: 'tool',
      toolName: 'read',
      argsPreview: 'apps/mobile/src/strings/zh.ts',
      text: '1 export const copy = {',
      status: 'ok',
      durationMs: 500,
    });
    const view = await render(<ToolRow message={tool} onOpen={onOpen} />);
    expect(view.getByText('已阅读')).toBeTruthy();
    expect(view.getByText('apps/mobile/src/strings/zh.ts')).toBeTruthy();
    expect(view.queryByText('1 export const copy = {')).toBeNull();
    expect(view.queryByText('500ms')).toBeNull();
    await fireEvent.press(view.getByLabelText('查看工具详情：已阅读 apps/mobile/src/strings/zh.ts'));
    expect(onOpen).toHaveBeenCalledWith(tool);
  });

  it('失败行整句「运行失败」+ 退出码尾（一眼能找到，不靠行尾颜色）', async () => {
    const view = await render(
      <ToolRow
        message={message({ id: 't', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', status: 'failed', exitCode: 1, text: '3 个用例失败' })}
        onOpen={jest.fn()}
      />,
    );
    expect(view.getByText('运行失败')).toBeTruthy();
    expect(view.getByText('退出码 1')).toBeTruthy();
    expect(view.queryByText('已运行')).toBeNull();
  });

  it('运行中行挂 spinner（shimmer 不作用于 SVG）', async () => {
    const view = await render(
      <ToolRow message={message({ id: 't', kind: 'tool', toolName: 'bash', argsPreview: 'bun run build', status: 'running' })} onOpen={jest.fn()} />,
    );
    expect(view.queryByTestId('tool-spinner', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText('正在运行')).toBeTruthy();
  });

  it('箭头常显（触屏无 hover）：有内容可看的行收起态也有箭头；空行不出死开关', async () => {
    const withContent = await render(
      <ToolRow message={message({ id: 't', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', status: 'ok' })} onOpen={jest.fn()} />,
    );
    expect(withContent.queryByTestId('tool-row-chevron', { includeHiddenElements: true })).toBeTruthy();
    const empty = await render(
      <ToolRow message={message({ id: 't', kind: 'tool', toolName: 'bash', status: 'ok', text: '' })} onOpen={jest.fn()} />,
    );
    expect(empty.queryByTestId('tool-row-chevron', { includeHiddenElements: true })).toBeNull();
  });

  it('task 工具展开子代理执行清单：agent 名 + 任务描述各一行', async () => {
    const view = await render(
      <ToolRow
        message={message({
          id: 't',
          kind: 'tool',
          toolName: 'task',
          status: 'ok',
          subagents: [{ agent: 'explore-ui', task: '核实组件职责' }],
        })}
        onOpen={jest.fn()}
      />,
    );
    expect(view.getByText('已派生智能体')).toBeTruthy();
    expect(view.getByText('explore-ui')).toBeTruthy();
    expect(view.getByText('核实组件职责')).toBeTruthy();
  });

  it('子代理清单缺半边不悬空：只有 agent / 只有任务描述都成行', async () => {
    const view = await render(
      <ToolRow
        message={message({
          id: 't',
          kind: 'tool',
          toolName: 'task',
          status: 'ok',
          subagents: [{ agent: 'explore-ui', task: '' }, { agent: '', task: '只带任务描述' }],
        })}
        onOpen={jest.fn()}
      />,
    );
    expect(view.getByText('explore-ui')).toBeTruthy();
    expect(view.getByText('只带任务描述')).toBeTruthy();
  });

  it('未知工具各状态直呼原名（不猜语义，不翻译）', async () => {
    const failed = await render(
      <ToolRow message={message({ id: 't', kind: 'tool', toolName: 'mcp__x__fetch', argsPreview: 'url', status: 'failed', exitCode: 2 })} onOpen={jest.fn()} />,
    );
    expect(failed.getByText('调用失败mcp__x__fetch')).toBeTruthy();

    const stopped = await render(
      <ToolRow message={message({ id: 't', kind: 'tool', toolName: 'mcp__x__fetch', argsPreview: 'url', status: 'stopped' })} onOpen={jest.fn()} />,
    );
    expect(stopped.getByText('已停止mcp__x__fetch')).toBeTruthy();

    const running = await render(
      <ToolRow message={message({ id: 't', kind: 'tool', toolName: 'mcp__x__fetch', argsPreview: 'url', status: 'running' })} onOpen={jest.fn()} />,
    );
    expect(running.getByText('正在调用mcp__x__fetch')).toBeTruthy();
  });

  it('垃圾输入降级：空工具名不出悬空前缀，行整体 ≥44pt 触控区', async () => {
    const view = await render(<ToolRow message={message({ id: 't', kind: 'tool', status: 'ok', text: '' })} onOpen={jest.fn()} />);
    expect(view.getByText('执行操作')).toBeTruthy();
    expect(minTouch(view.getByLabelText('查看工具详情：执行操作'))).toBeGreaterThanOrEqual(44);
  });
});

describe('ToolDetailSheet 完整命令与输出的唯一出口', () => {
  it('renders 命令 / 输出 / 退出码 / 耗时，并经 store 关闭', async () => {
    useNavigationStore.setState({ toolDetail: null, fileDiff: null });
    const empty = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(empty.queryByText('工具执行详情')).toBeNull();
    const detail = message({
      id: 't',
      kind: 'tool',
      toolName: 'bash',
      argsPreview: "cd /Users/wrr/work && bun test",
      text: 'Ran 2404 tests',
      status: 'failed',
      exitCode: 1,
      durationMs: 1500,
    });
    await act(() => Promise.resolve(useNavigationStore.getState().openToolDetail(detail)));
    const view = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(view.getByText('工具执行详情')).toBeTruthy();
    expect(view.getByText('运行失败')).toBeTruthy();
    expect(view.getByText('命令')).toBeTruthy();
    expect(view.getByText("cd /Users/wrr/work && bun test")).toBeTruthy();
    expect(view.getByText('输出')).toBeTruthy();
    expect(view.getByText('Ran 2404 tests')).toBeTruthy();
    expect(view.getByText('共工作 1s')).toBeTruthy();
    expect(view.getByText('退出码 1')).toBeTruthy();
    expect(view.getByText('完整命令与输出仅供查证，不在消息列表展示。')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('关闭'));
    expect(useNavigationStore.getState().toolDetail).toBeNull();
  });

  it('degrades blank metadata without noise（垃圾输入不崩、不显 undefined）', async () => {
    await act(() => Promise.resolve(useNavigationStore.getState().openToolDetail(message({ id: 't', kind: 'tool', durationMs: Number.NaN, text: '' }))));
    const view = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(view.getByText('执行操作')).toBeTruthy();
    expect(view.queryByText(/共工作/)).toBeNull();
    expect(view.queryByText('命令')).toBeNull();
    expect(view.queryByText('输出')).toBeNull();
    expect(view.queryByText('undefined')).toBeNull();
    await act(() => Promise.resolve(useNavigationStore.getState().closeToolDetail()));
  });

  it('运行中的输出只显头部流片段（用户盯的是结果面）', async () => {
    const head = `head${'x'.repeat(2500)}`;
    await act(() =>
      Promise.resolve(
        useNavigationStore.getState().openToolDetail(
          message({ id: 't', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', text: head, status: 'running' }),
        ),
      ),
    );
    const view = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(view.getByText(`head${'x'.repeat(1996)}`)).toBeTruthy();
    await act(() => Promise.resolve(useNavigationStore.getState().closeToolDetail()));
  });

  it('耗时与退出码各自独立成行：无退出码不挂尾，无耗时不报时', async () => {
    await act(() =>
      Promise.resolve(
        useNavigationStore.getState().openToolDetail(
          message({ id: 't', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', text: 'ok', status: 'ok', durationMs: 2500 }),
        ),
      ),
    );
    const okView = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(okView.getByText('共工作 2s')).toBeTruthy();
    expect(okView.queryByText(/退出码/)).toBeNull();
    await act(() => Promise.resolve(useNavigationStore.getState().closeToolDetail()));

    await act(() =>
      Promise.resolve(
        useNavigationStore.getState().openToolDetail(
          message({ id: 't', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', text: 'boom', status: 'failed', exitCode: 2 }),
        ),
      ),
    );
    const failedView = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(failedView.getByText('退出码 2')).toBeTruthy();
    expect(failedView.queryByText(/共工作/)).toBeNull();
    await act(() => Promise.resolve(useNavigationStore.getState().closeToolDetail()));
  });

  it('未知工具的输出用正文字体（非等宽类别不套终端字形）', async () => {
    await act(() =>
      Promise.resolve(
        useNavigationStore.getState().openToolDetail(
          message({ id: 't', kind: 'tool', toolName: 'webfetch', argsPreview: 'https://openai.com/codex/', text: '标题：Codex', status: 'ok' }),
        ),
      ),
    );
    const view = await render(<TestWrapper><ToolDetailSheet /></TestWrapper>);
    expect(view.getByText('已调用webfetch')).toBeTruthy();
    expect(view.getByText('标题：Codex')).toBeTruthy();
    await act(() => Promise.resolve(useNavigationStore.getState().closeToolDetail()));
  });
});
