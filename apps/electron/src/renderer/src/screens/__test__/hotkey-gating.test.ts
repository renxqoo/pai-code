import { describe, expect, test } from 'bun:test';

import { hotkeyGating, type HotkeyOverlays } from '../hotkey-gating';

/** ⌘N/⌘K/⌘P 门控矩阵表驱动（T32 §3.1-11：重接线不得漂移的现状规格）。 */

function overlays(overrides: Partial<HotkeyOverlays> = {}): HotkeyOverlays {
  return {
    dialogCount: 0,
    paletteOpen: false,
    newTaskOpen: false,
    usageOpen: false,
    settingsOpen: false,
    projectFilesOpen: false,
    ...overrides,
  };
}

describe('hotkeyGating 门控矩阵', () => {
  test('全关：两类热键可用', () => {
    expect(hotkeyGating(overlays())).toEqual({ hotkeysEnabled: true, paletteHotkeyEnabled: true });
  });

  test('任一模态/覆盖开（含项目文件面板）：⌘N/⌘K 整体失效', () => {
    for (const patch of [
      { dialogCount: 1 },
      { paletteOpen: true },
      { newTaskOpen: true },
      { usageOpen: true },
      { settingsOpen: true },
      { projectFilesOpen: true },
    ] as Partial<HotkeyOverlays>[]) {
      expect(hotkeyGating(overlays(patch)).hotkeysEnabled).toBe(false);
    }
  });

  test('⌘P 独立门控：对话框与整页覆盖禁用，项目文件面板与 palette 自身状态不禁用', () => {
    for (const patch of [{ dialogCount: 1 }, { newTaskOpen: true }, { usageOpen: true }, { settingsOpen: true }] as Partial<HotkeyOverlays>[]) {
      expect(hotkeyGating(overlays(patch)).paletteHotkeyEnabled).toBe(false);
    }
    // 面板打开时仍可唤起 palette（T30 审查 高-3）；palette 开着也要能再按关掉
    expect(hotkeyGating(overlays({ projectFilesOpen: true })).paletteHotkeyEnabled).toBe(true);
    expect(hotkeyGating(overlays({ paletteOpen: true })).paletteHotkeyEnabled).toBe(true);
  });
});
