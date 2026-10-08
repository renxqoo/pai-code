/**
 * ⌘N/⌘K/⌘⇧D/⌘⇧A 热键门控矩阵（单一真相）：
 * ⌘N/⌘⇧D/⌘⇧A 在任一整页覆盖开着时整体失效；⌘K 独立门控——整页覆盖（设置/用量/
 * 新建任务）开着不唤起，但不受项目文件面板影响，也不受面板自身开着影响（面板开着
 * 再按 ⌘K 要能关掉）。hub confirm 待答为输入区内联条（非模态），不参与门控。
 */

export type HotkeyOverlays = {
  commandPanelOpen: boolean;
  newTaskOpen: boolean;
  usageOpen: boolean;
  settingsOpen: boolean;
  projectFilesOpen: boolean;
};

export type HotkeyGating = {
  /** ⌘N/⌘⇧D/⌘⇧A 是否可劫持（面板开着时停用，避免焦点穿到遮罩后方）。 */
  hotkeysEnabled: boolean;
  /** ⌘K 是否可唤起（面板开着也要能再按关掉）。 */
  panelHotkeyEnabled: boolean;
};

export function hotkeyGating(overlays: HotkeyOverlays): HotkeyGating {
  const fullPageCovered = overlays.newTaskOpen || overlays.usageOpen || overlays.settingsOpen;
  return {
    hotkeysEnabled: !overlays.commandPanelOpen && !fullPageCovered && !overlays.projectFilesOpen,
    panelHotkeyEnabled: !fullPageCovered,
  };
}