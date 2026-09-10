/**
 * ⌘N/⌘K/⌘P 热键门控矩阵（T32 §3.1-11 规格的单一真相）：
 * ⌘N/⌘K 在任一模态覆盖/对话框开着时整体失效（模态层优先于全局热键，否则 ⌘K 会
 * 把焦点从对话框抢进遮罩后方的搜索框）；⌘P 独立门控——hub 对话框与整页覆盖
 * （设置/用量/新建任务）开着不唤起，但不受项目文件面板影响（面板打开时仍可唤起，
 * T30 审查 高-3 的裁决语义）。
 */

export type HotkeyOverlays = {
  dialogCount: number;
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
    hotkeysEnabled:
      overlays.dialogCount === 0 && !overlays.paletteOpen && !fullPageCovered && !overlays.projectFilesOpen,
    paletteHotkeyEnabled: overlays.dialogCount === 0 && !fullPageCovered,
  };
}
