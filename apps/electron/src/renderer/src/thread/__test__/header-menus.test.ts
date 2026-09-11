import { describe, expect, test } from 'bun:test';

import { projectMenuItems, sessionMenuItems } from '../header-menus';

const PROJECT_LABELS = {
  openMenu: ['在访达中打开', '在终端中打开', '在编辑器中打开'] as const,
  copyPath: '复制路径',
};

const SESSION_LABELS = {
  rename: '重命名',
  copyId: '复制会话 ID',
  reloadTrusted: '以受信模式重开',
  reloadUntrusted: '以非受信模式重开',
  archive: '归档会话',
  close: '关闭会话',
};

describe('projectMenuItems', () => {
  test('四动作 + 分隔符；id 词表封闭', () => {
    expect(projectMenuItems(PROJECT_LABELS)).toEqual([
      { kind: 'item', id: 'finder', label: '在访达中打开' },
      { kind: 'item', id: 'terminal', label: '在终端中打开' },
      { kind: 'item', id: 'editor', label: '在编辑器中打开' },
      { kind: 'separator' },
      { kind: 'item', id: 'copyPath', label: '复制路径' },
    ]);
  });
});

describe('sessionMenuItems', () => {
  test('空闲态全量：重命名/复制 ID/受信重开×2/关闭', () => {
    const items = sessionMenuItems(SESSION_LABELS, false);
    expect(items.map((item) => (item.kind === 'item' ? item.id : 'sep'))).toEqual([
      'rename',
      'copyId',
      'sep',
      'reloadTrusted',
      'reloadUntrusted',
      'archive',
      'sep',
      'close',
    ]);
  });

  test('生成中隐藏受信重开段（重开链需先停轮）', () => {
    const items = sessionMenuItems(SESSION_LABELS, true);
    expect(items.map((item) => (item.kind === 'item' ? item.id : 'sep'))).toEqual(['rename', 'copyId', 'sep', 'close']);
  });
});
