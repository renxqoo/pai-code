import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { ProcessFold } from '@/features/chat/process-fold';
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
  it('auto-opens completed turns only on demand: 正常完成收起为摘要，点按展开过程流', async () => {
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
    await fireEvent.press(header);
    expect(view.getByText('先看现状')).toBeTruthy();
    // 思考行收起即预览正文（触屏无 hover：一行预览帮判断值不值得展开）
    expect(view.getByText('检查入口')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/展开思考详情/));
    expect(view.getByLabelText(/收起思考详情/).props.accessibilityState).toEqual({ expanded: true });
  });

  it('auto-opens while running and after a terminal failure（失败现场不得被收起摘要盖住）', async () => {
    const running = await render(
      <ProcessFold
        turn={turn(
          message({ id: 'u1', kind: 'user' }),
          message({ id: 'tool', kind: 'tool', toolName: 'bash', argsPreview: 'bun run build:android', status: 'running' }),
        )}
      />,
    );
    expect(running.getByLabelText(/收起过程流/).props.accessibilityState).toEqual({ expanded: true });

    const failed = await render(
      <ProcessFold
        turn={turn(
          message({ id: 'u2', kind: 'user' }),
          message({ id: 'tool', kind: 'tool', toolName: 'bash', status: 'failed', text: '断言失败' }),
        )}
      />,
    );
    expect(failed.getByLabelText(/收起过程流/).props.accessibilityState).toEqual({ expanded: true });
    // 失败原因是轮末 TurnFailureNotice 的职责，折叠头保持中性
    expect(failed.queryByText('执行遇到问题')).toBeNull();
  });

  it('manual toggle overrides the auto state（手动意图优先于自动）', async () => {
    const view = await render(
      <ProcessFold
        turn={turn(
          message({ id: 'u1', kind: 'user' }),
          message({ id: 'tool', kind: 'tool', toolName: 'bash', argsPreview: 'bun test', status: 'running' }),
        )}
      />,
    );
    const header = view.getByLabelText(/收起过程流/);
    await fireEvent.press(header);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
  });

  it('运行中头行只有走表 + 流光（症状：当前动作曾在头行以第二种布局重复，与过程流运行行撞脸）', async () => {
    const view = await render(
      <ProcessFold
        elapsedMs={76_000}
        turn={turn(
          message({ id: 'u1', kind: 'user' }),
          message({ id: 'tool', kind: 'tool', toolName: 'bash', argsPreview: 'bun run build:android', status: 'running' }),
        )}
      />,
    );
    // 头行裁决：执行中显示「已工作 X」，不显示「已完成」、无勾图标、无旋转 loading（loading 只在底部）
    expect(view.getByText('已工作 1m 16s')).toBeTruthy();
    expect(view.queryByText('已完成')).toBeNull();
    expect(view.queryAllByTestId('loading-spinner', { includeHiddenElements: true })).toHaveLength(0);
    // 当前动作只由过程流的运行行承担，头行不再重复成第二种布局
    expect(view.queryByTestId('fold-headline')).toBeNull();
    expect(view.queryByText('正在运行 bun run build:android')).toBeNull();
    expect(view.getByText('正在运行')).toBeTruthy();
    expect(view.getByText('bun run build:android')).toBeTruthy();
  });

  it('收起态头行只有耗时，不挂「改了 N 个文件」后缀（用户裁决：头行不加变更计数）', async () => {
    const view = await render(
      <ProcessFold
        turn={turn(
          message({ id: 'u1', kind: 'user' }),
          message({ id: 'e1', kind: 'tool', toolName: 'edit', status: 'ok', editHunks: [{ path: 'src/a.ts', oldText: 'a', newText: 'b' }] }),
          message({ id: 'r1', kind: 'assistant', text: '改完了' }),
        )}
      />,
    );
    expect(view.queryByText(/改了/)).toBeNull();
    expect(view.queryByText(/共工作/)).toBeNull();
  });
});
