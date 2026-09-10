import { describe, expect, test } from 'bun:test';

import {
  FETCH_ON_ENTER_SECTIONS,
  SETTINGS_FIRST_SECTION,
  SETTINGS_NAV_GROUPS,
  type SettingsSectionId,
} from '../settings-sections';

const ALL_SECTIONS: readonly SettingsSectionId[] = [
  'general',
  'providers',
  'permissions',
  'agents',
  'skills',
  'history',
];

describe('设置分区模型', () => {
  test('分组导航恰好覆盖全部分区且无重复', () => {
    const flattened = SETTINGS_NAV_GROUPS.flatMap((group) => group.sections);
    expect([...flattened].sort()).toEqual([...ALL_SECTIONS].sort());
    expect(new Set(flattened).size).toBe(flattened.length);
  });

  test('分组顺序固定：基础设置 → Agent 能力 → 数据与统计', () => {
    expect(SETTINGS_NAV_GROUPS.map((group) => group.id)).toEqual(['basics', 'agent', 'data']);
  });

  test('首分区为常规', () => {
    expect(SETTINGS_FIRST_SECTION).toBe('general');
    const basics = SETTINGS_NAV_GROUPS.find((group) => group.id === 'basics');
    expect(basics?.sections).toContain(SETTINGS_FIRST_SECTION);
  });

  test('按开即读分区与无推送目录一致', () => {
    expect([...FETCH_ON_ENTER_SECTIONS].sort()).toEqual(['agents', 'permissions', 'skills']);
  });
});
