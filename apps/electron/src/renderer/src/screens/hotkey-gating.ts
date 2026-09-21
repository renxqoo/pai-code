/**
 * ⌘N/⌘K/⌘P 热键门控矩阵（T32 §3.1-11 规格的单一真相）：
 * ⌘N/⌘K 在任一整页覆盖开着时整体失效；⌘P 独立门控——整页覆盖（设置/用量/新建
 * 任务）开着不唤起，但不受项目文件面板影响（面板打开时仍可唤起，T30 审查 高-3
 * 的裁决语义）。hub confirm 待答为输入区内联条（非模态），不参与门控。
 */

export type HotkeyOverlays = {
  paletteOpen: boolean;
  newTaskOpen: boolean;
  usageOpen: boolean;
  settingsOpen: boolean;
  projectFilesOpen: boolean;
};

export type HotkeyGating = {
  /** ⌘N/⌘K 是否可劫持。 */
  hotkeysEnabled: boolean;
  /** ⌘P 是否可唤起（面板开着也要能再按关掉）。 */
  paletteHotkeyEnabled: boolean;
};

export function hotkeyGating(overlays: HotkeyOverlays): HotkeyGating {
  const fullPageCovered = overlays.newTaskOpen || overlays.usageOpen || overlays.settingsOpen;
  return {
    hotkeysEnabled: !overlays.paletteOpen && !fullPageCovered && !overlays.projectFilesOpen,
    paletteHotkeyEnabled: !fullPageCovered,
  };
}
