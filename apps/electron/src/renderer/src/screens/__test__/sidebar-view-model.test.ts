import { describe, expect, test } from 'bun:test';

import { buildSidebarViewModel } from '../sidebar-view-model';
import type { SessionCardModel } from '@/sidebar/session-card-model';

/** 空态裁决下沉（D2）：'filtered' / 'none' / null 三态由视图模型单一真相给出。 */

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
  test('零会话且无查询 = none（引导文案态）', () => {
    const vm = buildSidebarViewModel([], new Set(), new Set(), new Set(), '', new Set());
    expect(vm.emptyState).toBe('none');
  });

  test('有会话但全部被过滤 = filtered（查询非空）', () => {
    const vm = buildSidebarViewModel([card('a')], new Set(), new Set(), new Set(), 'zzz-无匹配', new Set());
    expect(vm.emptyState).toBe('filtered');
  });

  test('查询非空且有匹配 = null（正常列表）', () => {
    const vm = buildSidebarViewModel([card('a', { title: '修复排队消息' })], new Set(), new Set(), new Set(), '排队', new Set());
    expect(vm.emptyState).toBe(null);
    expect(vm.timeList).toHaveLength(1);
  });

  test('全部会话被隐藏/归档清空且无查询 = none（与零会话同态）', () => {
    const vm = buildSidebarViewModel(
      [card('a')],
      new Set(['/tmp/pai']),
      new Set(),
      new Set(['/tmp/pai/sessions/a.jsonl']),
      '',
      new Set(),
    );
    expect(vm.emptyState).toBe('none');
  });

  test('查询为纯空白 = 视为无查询（空列表归 none 而非 filtered）', () => {
    const vm = buildSidebarViewModel([], new Set(), new Set(), new Set(), '   ', new Set());
    expect(vm.emptyState).toBe('none');
  });
});
