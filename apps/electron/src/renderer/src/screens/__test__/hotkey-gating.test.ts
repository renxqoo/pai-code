import { describe, expect, test } from 'bun:test';

import { hotkeyGating, type HotkeyOverlays } from '../hotkey-gating';

/** ⌘N/⌘K/⌘⇧D/⌘⇧A 门控矩阵表驱动：重接线不得漂移的现状规格。 */

function overlays(overrides: Partial<HotkeyOverlays> = {}): HotkeyOverlays {
  return {
    commandPanelOpen: false,
    newTaskOpen: false,
    usageOpen: false,
    settingsOpen: false,
    projectFilesOpen: false,
    ...overrides,
  };
}

describe('hotkeyGating 门控矩阵', () => {
  test('全关：两类热键可用', () => {
    expect(hotkeyGating(overlays())).toEqual({ hotkeysEnabled: true, panelHotkeyEnabled: true });
  });

  test('面板开着或侧栏内嵌层开着：⌘N/⌘⇧D/⌘⇧A 停用（避免焦点穿到遮罩后）', () => {
    for (const patch of [
      { commandPanelOpen: true },
      { newTaskOpen: true },
      { usageOpen: true },
      { settingsOpen: true },
      { projectFilesOpen: true },
    ] as Partial<HotkeyOverlays>[]) {
      expect(hotkeyGating(overlays(patch)).hotkeysEnabled).toBe(false);
    }
  });

  test('⌘K 独立门控：整页覆盖禁用，项目文件面板与面板自身状态不禁用（toggle 需要）', () => {
    for (const patch of [{ newTaskOpen: true }, { usageOpen: true }, { settingsOpen: true }] as Partial<HotkeyOverlays>[]) {
      expect(hotkeyGating(overlays(patch)).panelHotkeyEnabled).toBe(false);
    }
    expect(hotkeyGating(overlays({ projectFilesOpen: true })).panelHotkeyEnabled).toBe(true);
    // 面板开着也要能再按 ⌘K 关掉——这条若失守，toggle 静默失效且外观上看不出来
    expect(hotkeyGating(overlays({ commandPanelOpen: true })).panelHotkeyEnabled).toBe(true);
    // 但面板开着时其余热键必须停用：两者是不同门控，不能合并
    expect(hotkeyGating(overlays({ commandPanelOpen: true })).hotkeysEnabled).toBe(false);
  });
});