import { describe, expect, test } from 'bun:test';

import { copy } from '@/strings';

import { greetingTexts, quickTaskItems, workspaceItems } from '../new-task-view-model';

describe('greetingTexts', () => {
  test('四时段各有标题与副标题，且互不相同（回归锚点：文案键错位会串词）', () => {
    const keys = ['night', 'morning', 'afternoon', 'evening'] as const;
    const titles = keys.map((key) => greetingTexts(key).title);
    expect(new Set(titles).size).toBe(4);
    expect(greetingTexts('morning')).toEqual({ title: copy.newTask.greetingMorning, subtitle: copy.newTask.subtitleMorning });
    expect(greetingTexts('evening')).toEqual({ title: copy.newTask.greetingEvening, subtitle: copy.newTask.subtitleEvening });
  });
});

describe('quickTaskItems', () => {
  test('四条胶囊：label 展示、prompt 预填（预填串包含 label）', () => {
    const items = quickTaskItems();
    expect(items).toHaveLength(4);
    for (const [index, item] of items.entries()) {
      expect(item.label).toBe(copy.newTask.quickTasks[index]);
      expect(item.prompt).toContain(item.label);
    }
  });
});

describe('workspaceItems', () => {
  test('目录名作展示、完整路径作次级说明；空路径回退整串', () => {
    expect(workspaceItems(['/w/app', '/w/tools/cli'])).toEqual([
      { id: '/w/app', label: 'app', detail: '/w/app' },
      { id: '/w/tools/cli', label: 'cli', detail: '/w/tools/cli' },
    ]);
  });

  test('空列表返回空数组（弹窗空态由 emptyLabel 呈现）', () => {
    expect(workspaceItems([])).toEqual([]);
  });
});
