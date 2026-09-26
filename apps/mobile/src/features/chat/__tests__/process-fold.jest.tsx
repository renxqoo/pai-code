import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ProcessFold } from '@/features/chat/process-fold';
import { ToolRow } from '@/features/chat/tool-row';
import { ToolGroup } from '@/features/chat/tool-group';
import { buildTurns } from '@/features/chat/turns';
import type { ChatMessage } from '@/types/domain';

type MessageValues = Pick<ChatMessage, 'id' | 'kind'> & Partial<Omit<ChatMessage, 'id' | 'kind'>>;

const message = (values: MessageValues): ChatMessage => ({
  text: values.id,
  createdAt: 'now',
  ...values,
});

const turn = (...messages: ChatMessage[]) => {
  const [built] = buildTurns(messages);
  if (built === undefined) throw new Error('turn missing');
  return built;
};

describe('ProcessFold', () => {
  it('is folded by default and expands to reveal the process stream', async () => {
    const view = await render(
      <ProcessFold
        turn={turn(
          message({ id: 'u1', kind: 'user' }),
          message({ id: 'n1', kind: 'assistant', text: '先看现状' }),
          message({ id: 'think', kind: 'thinking', text: '检查入口' }),
          message({ id: 'r1', kind: 'assistant', text: '结论' }),
        )}
      />,
    );
    const header = view.getByLabelText(/收起过程流|展开过程流/);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(view.queryByText('先看现状')).toBeNull();
    expect(view.queryByText('检查入口')).toBeNull();
    await fireEvent.press(header);
    expect(view.getByText('先看现状')).toBeTruthy();
    expect(view.queryByText('检查入口')).toBeNull();
    await fireEvent.press(view.getByLabelText(/展开思考详情/));
    expect(view.getByText('检查入口')).toBeTruthy();
  });

  it('keeps the fold header neutral for failed turns (failure is a turn-end notice)', async () => {
    const view = await render(
      <ProcessFold
        turn={turn(
          message({ id: 'u1', kind: 'user' }),
          message({ id: 'tool', kind: 'tool', title: '运行测试', text: '断言失败', summary: '2 个用例失败', status: 'error' }),
        )}
      />,
    );
    // 失败终态不在折叠头：默认收起、无警示图标文案，失败原因由轮末 TurnFailureNotice 呈现
    const header = view.getByLabelText(/展开过程流|收起过程流/);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(view.queryByTestId('fold-spinner', { includeHiddenElements: true })).toBeNull();
    expect(view.queryByText('执行遇到问题')).toBeNull();
    await fireEvent.press(header);
    expect(header.props.accessibilityState).toEqual({ expanded: true });
    expect(view.queryByText('2 个用例失败')).toBeNull();
  });

  it('shows current action, spinner and elapsed while running', async () => {
    const view = await render(
      <ProcessFold
        elapsedMs={76_000}
        turn={turn(
          message({ id: 'u1', kind: 'user' }),
          message({ id: 'tool', kind: 'tool', title: '构建 Android', text: '打包中', status: 'running' }),
        )}
      />,
    );
    // T50 头行裁决：执行中显示「已工作 X」+ 当前动作摘要，不显示「已完成」、无勾图标
    expect(view.getByText('已工作 1m 16s')).toBeTruthy();
    expect(view.getByText('构建 Android')).toBeTruthy();
    expect(view.queryByText('已完成')).toBeNull();
    expect(view.queryByTestId('fold-spinner', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('ToolRow and ToolGroup', () => {
  it('shows a text-first tool row and opens the detail sheet on press', async () => {
    const onOpen = jest.fn();
    const tool = message({ id: 't1', kind: 'tool', title: '写入文件', text: '完整输出内容', summary: '写入 package.json', status: 'success', durationMs: 500 });
    const view = await render(<ToolRow message={tool} onOpen={onOpen} />);
    // T50 文案为主：动作 + 摘要，不透出命令原文；耗时不在行内（进详情弹窗）
    expect(view.getByText('写入文件  写入 package.json')).toBeTruthy();
    expect(view.queryByText('完整输出内容')).toBeNull();
    expect(view.queryByText('500ms')).toBeNull();
    await fireEvent.press(view.getByLabelText('查看工具详情：写入文件  写入 package.json'));
    expect(onOpen).toHaveBeenCalledWith(tool);
  });

  it('folds concurrent tools as a group and lists rows when expanded', async () => {
    const tools = [
      message({ id: 't1', kind: 'tool', title: '读取配置', text: 'a', status: 'success' }),
      message({ id: 't2', kind: 'tool', title: '写入文件', text: 'b', status: 'success' }),
      message({ id: 't3', kind: 'tool', title: '运行测试', text: 'c', status: 'running' }),
    ];
    const view = await render(<ToolGroup messages={tools} onOpen={jest.fn()} />);
    const header = view.getByLabelText(/收起工具组|展开工具组/);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(view.queryByText('读取配置')).toBeNull();
    await fireEvent.press(header);
    expect(view.getByText('读取配置')).toBeTruthy();
    expect(view.getByText('写入文件')).toBeTruthy();
    expect(view.getByText('运行测试')).toBeTruthy();
    expect(view.getByText('3 个工具')).toBeTruthy();
  });
});
