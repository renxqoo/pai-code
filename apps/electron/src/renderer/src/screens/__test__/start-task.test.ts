import { describe, expect, test } from 'bun:test';

import { startTask, type NewTaskStart, type StartTaskDeps } from '../start-task';

/**
 * 新建任务提交链：startTask 透传 onCreate 的结果（会话创建在动作层）。
 */

const BASE: NewTaskStart = {
  cwd: '/w/app',
  trusted: true,
  model: 'glm/glm-5.3',
  permissionMode: null,
  thinkingLevel: null,
  text: '请修复构建',
  attachments: [],
};

describe('startTask 提交链', () => {
  test('透传输入并返回 onCreate 结果', async () => {
    const seen: NewTaskStart[] = [];
    const deps: StartTaskDeps = {
      onCreate: (input) => {
        seen.push(input);
        return Promise.resolve(true);
      },
    };
    expect(await startTask(BASE, deps)).toBe(true);
    expect(seen).toEqual([BASE]);
  });

  test('onCreate false → false（调用方保持本页）', async () => {
    const deps: StartTaskDeps = { onCreate: () => Promise.resolve(false) };
    expect(await startTask(BASE, deps)).toBe(false);
  });
});
