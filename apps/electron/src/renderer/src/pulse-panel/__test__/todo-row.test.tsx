import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TodoSnapshotTask } from '@paiapp/contracts';

import { TodoRow } from '../todo-row';

/**
 * todo 任务行（T44）：三态渲染（完成删除线灰化）、owner 归属 pill、
 * 有 description 才是按钮（展开语义），无 description 纯展示。
 */

function task(overrides: Partial<TodoSnapshotTask>): TodoSnapshotTask {
  return { id: '1', subject: '批次 A', status: 'pending', ...overrides };
}

describe('TodoRow', () => {
  test('completed：删除线灰化 + 绿勾', () => {
    const html = renderToStaticMarkup(<TodoRow task={task({ status: 'completed' })} />);
    expect(html).toContain('line-through');
    expect(html).toContain('text-dot-done');
    expect(html).toContain('批次 A');
  });

  test('in_progress：进行中着色（无删除线）', () => {
    const html = renderToStaticMarkup(<TodoRow task={task({ status: 'in_progress' })} />);
    expect(html).toContain('text-dot-active');
    expect(html).not.toContain('line-through');
  });

  test('pending：灰化空心圈（无完成/进行中着色）', () => {
    const html = renderToStaticMarkup(<TodoRow task={task({ status: 'pending' })} />);
    expect(html).not.toContain('line-through');
    expect(html).not.toContain('text-dot-done');
    expect(html).not.toContain('text-dot-active');
  });

  test('owner 归属 pill 渲染；无 owner 不渲染', () => {
    expect(renderToStaticMarkup(<TodoRow task={task({ owner: 'worker-2' })} />)).toContain('worker-2');
    expect(renderToStaticMarkup(<TodoRow task={task({})} />)).not.toContain('worker-2');
  });

  test('有 description 是展开按钮（aria-expanded）；无 description 纯展示（无按钮）', () => {
    const expandable = renderToStaticMarkup(<TodoRow task={task({ description: '收窄 task-tools' })} />);
    expect(expandable).toContain('<button');
    expect(expandable).toContain('aria-expanded="false"');
    const plain = renderToStaticMarkup(<TodoRow task={task({})} />);
    expect(plain).not.toContain('<button');
    // 未展开不渲染描述
    expect(expandable).not.toContain('收窄 task-tools');
  });

  test('无障碍名 = 任务行文案', () => {
    expect(renderToStaticMarkup(<TodoRow task={task({})} />)).toContain('任务：批次 A');
  });
});
