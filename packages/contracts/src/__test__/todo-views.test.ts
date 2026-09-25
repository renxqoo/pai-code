import { describe, expect, test } from 'bun:test';

import {
  isTodoTool,
  TODO_TOOL_NAMES,
  TodoSnapshotEventDataSchema,
  TodoTaskStatusSchema,
} from '../todo-views';

/**
 * todo 清单视图（T44）：状态三值闭包、快照 schema 宽容性、
 * 过滤词表封闭性（导出词表 == 过滤判定的单一真相）。
 */

describe('TodoTaskStatusSchema', () => {
  test('三值闭包：pending|in_progress|completed 收，deleted 与垃圾拒', () => {
    for (const status of ['pending', 'in_progress', 'completed']) {
      expect(TodoTaskStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(TodoTaskStatusSchema.safeParse('deleted').success).toBe(false);
    expect(TodoTaskStatusSchema.safeParse('').success).toBe(false);
    expect(TodoTaskStatusSchema.safeParse(1).success).toBe(false);
  });
});

describe('TodoSnapshotEventDataSchema', () => {
  test('全量快照收（可选字段缺省）', () => {
    const parsed = TodoSnapshotEventDataSchema.safeParse({
      seq: 3,
      tasks: [{ id: '1', subject: '批次 A', status: 'in_progress' }],
      edges: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tasks[0]?.description).toBeUndefined();
      expect(parsed.data.tasks[0]?.owner).toBeUndefined();
    }
  });

  test('可选字段与依赖边收', () => {
    const parsed = TodoSnapshotEventDataSchema.safeParse({
      seq: 1,
      tasks: [{ id: '2', subject: 's', status: 'completed', description: 'd', activeForm: 'a', owner: 'explore-1', metadata: { k: 1 } }],
      edges: [['1', '2']],
    });
    expect(parsed.success).toBe(true);
  });

  test.each([
    ['缺 seq', { tasks: [], edges: [] }],
    ['tasks 非数组', { seq: 1, tasks: {}, edges: [] }],
    ['任务缺 subject', { seq: 1, tasks: [{ id: '1', status: 'pending' }], edges: [] }],
    ['edges 元组形状错', { seq: 1, tasks: [], edges: [['1']] }],
    ['垃圾', 'x'],
    ['null', null],
  ])('垃圾形状拒：%s', (_name: string, value: unknown) => {
    expect(TodoSnapshotEventDataSchema.safeParse(value).success).toBe(false);
  });
});

describe('isTodoTool / TODO_TOOL_NAMES', () => {
  test('词表 = x-harness todo-tools 注册名（封闭）', () => {
    expect([...TODO_TOOL_NAMES]).toEqual(['task_create', 'task_get', 'task_list', 'task_update']);
  });

  test.each(TODO_TOOL_NAMES)('%s 判 todo 工具（含大小写变体）', (name) => {
    expect(isTodoTool(name)).toBe(true);
    expect(isTodoTool(name.toUpperCase())).toBe(true);
    expect(isTodoTool(`  ${name}  `)).toBe(true);
  });

  test.each(['bash', 'read', 'agent_spawn', 'task', 'task_create_x', 'TaskCreate2', ''])('%s 非 todo 工具', (name) => {
    expect(isTodoTool(name)).toBe(false);
  });
});
