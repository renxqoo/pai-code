/**
 * 设置分区模型：分区 id、分组导航结构与进入即拉取集合的单一真相。
 * 文案 key 由 strings 提供（settings.*Title / settings.navGroup*），这里只放结构。
 */
export type SettingsSectionId =
  | 'general'
  | 'providers'
  | 'permissions'
  | 'agents'
  | 'skills'
  | 'history';

/** 打开设置页时回到的首分区。 */
export const SETTINGS_FIRST_SECTION: SettingsSectionId = 'general';

/** 按开即读分区（目录/文件面无推送，每次进入都拉取）。 */
export const FETCH_ON_ENTER_SECTIONS: ReadonlySet<SettingsSectionId> = new Set([
  'permissions',
  'agents',
  'skills',
]);

export type SettingsNavGroupId = 'basics' | 'agent' | 'data';

export type SettingsNavGroup = {
  id: SettingsNavGroupId;
  sections: readonly SettingsSectionId[];
};

/** 左侧导航分组（顺序即展示顺序）。 */
export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  { id: 'basics', sections: ['general', 'providers'] },
  { id: 'agent', sections: ['permissions', 'agents', 'skills'] },
  { id: 'data', sections: ['history'] },
];
