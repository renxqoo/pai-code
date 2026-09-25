import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { ExecutionTodoDock } from '@/features/chat/execution-todo-dock';
import type { ActiveExecution } from '@/features/chat/active-execution';

const execution: ActiveExecution = {
  messages: [],
  completed: 1,
  total: 3,
  durationMs: 1600,
  todos: [
    { id: 'done', title: '读取配置', detail: '配置已读取', state: 'done' },
    { id: 'current', title: '构建 Android', detail: '正在打包', state: 'current' },
    { id: 'pending', title: '检查结果', detail: '等待构建', state: 'pending' },
  ],
};

describe('ExecutionTodoDock', () => {
  it('reports collapse and expansion to the owner', async () => {
    const onExpandedChange = jest.fn();
    const view = await render(<ExecutionTodoDock execution={execution} expanded onExpandedChange={onExpandedChange} />);
    expect(view.getByText('读取配置')).toBeTruthy();
    expect(view.getByText('1 / 3 · 1.6s')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('收起执行清单'));
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    await view.rerender(<ExecutionTodoDock execution={execution} expanded={false} onExpandedChange={onExpandedChange} />);
    expect(view.queryByText('读取配置')).toBeNull();
    expect(view.getByText('构建 Android · 正在打包')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('展开执行清单'));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it('renders nothing without an active execution', async () => {
    const view = await render(<ExecutionTodoDock execution={null} expanded onExpandedChange={jest.fn()} />);
    expect(view.queryByLabelText('执行清单')).toBeNull();
  });
});
