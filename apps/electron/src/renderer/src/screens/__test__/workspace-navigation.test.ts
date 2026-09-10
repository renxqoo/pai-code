import { describe, expect, test } from 'bun:test';

import { createNavigationHandlers } from '../workspace-navigation';

/**
 * 症状回归：新建任务页（整页模式）开着时点侧栏历史对话没有任何反应——
 * 导航出口必须退出整页模式；侧栏行与设置页历史共用同一出口。
 */
function makeDeps() {
  const calls: string[] = [];
  const deps = {
    closeNewTask: () => calls.push('closeNewTask'),
    selectSession: (threadId: string) => calls.push(`selectSession:${threadId}`),
    openSavedSession: (sessionPath: string) => calls.push(`openSavedSession:${sessionPath}`),
    closePanel: () => calls.push('closePanel'),
    closeSettings: () => calls.push('closeSettings'),
  };
  return { deps, calls };
}

describe('createNavigationHandlers', () => {
  test('侧栏选择会话：先退出新建任务页 → 切会话；不清面板（面板按会话记忆，导航侧清面板会把存档覆盖成空——T30 审查 高-1 回归）', () => {
    const { deps, calls } = makeDeps();
    createNavigationHandlers(deps).onSelectSession('t1');
    expect(calls).toEqual(['closeNewTask', 'selectSession:t1']);
  });

  test('设置页历史打开会话：先退出新建任务页 → 打开会话 → 关设置页', () => {
    const { deps, calls } = makeDeps();
    createNavigationHandlers(deps).onOpenSavedSession('/s.jsonl');
    expect(calls).toEqual(['closeNewTask', 'openSavedSession:/s.jsonl', 'closeSettings']);
  });

  test('未打开新建任务页时退出是幂等空操作（closeNewTask 恒被调用，由调用方保证幂等）', () => {
    const { deps, calls } = makeDeps();
    const handlers = createNavigationHandlers(deps);
    handlers.onSelectSession('a');
    handlers.onSelectSession('b');
    expect(calls.filter((call) => call === 'closeNewTask')).toHaveLength(2);
  });
});
