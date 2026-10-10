import { describe, expect, test } from 'bun:test';

import { buildSidebarViewModel } from '../sidebar-view-model';
import type { SessionCardModel } from '@/sidebar/session-card-model';

/** 空态裁决下沉：'none' / null 两态由视图模型单一真相给出。 */

function card(id: string, overrides: Partial<SessionCardModel> = {}): SessionCardModel {
  return {
    id,
    projectName: 'pai',
    title: `会话-${id}`,
    version: '',
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/sessions/${id}.jsonl`,
    state: 'live',
    streaming: false,
    lastActivityAt: 1000,
    ...overrides,
  };
}

describe('buildSidebarViewModel emptyState', () => {
  test('零会话 = none（引导文案态）', () => {
    const vm = buildSidebarViewModel([], new Set(), new Set(), new Set(), new Set());
    expect(vm.emptyState).toBe('none');
  });

  test('有会话 = null（正常列表）', () => {
    const vm = buildSidebarViewModel([card('a')], new Set(), new Set(), new Set(), new Set());
    expect(vm.emptyState).toBe(null);
    expect(vm.projectGroups).toHaveLength(1);
  });

  test('全部会话被隐藏/归档清空 = none', () => {
    const vm = buildSidebarViewModel(
      [card('a')],
      new Set(['/tmp/pai']),
      new Set(),
      new Set(['/tmp/pai/sessions/a.jsonl']),
      new Set(),
    );
    expect(vm.emptyState).toBe('none');
  });

  test('隐藏项目单独清空可见列表 = none', () => {
    const vm = buildSidebarViewModel([card('a')], new Set(['/tmp/pai']), new Set(), new Set(), new Set());
    expect(vm.emptyState).toBe('none');
    expect(vm.visible).toHaveLength(0);
  });
});