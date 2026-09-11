import * as React from 'react';
import { useStore } from 'zustand';

import { openFilePicker, openFileTab, readFile } from '@/panel/panel-controller';
import { panelSwitchOutcome, type PanelState, type PanelTab } from '@/panel/panel-state';
import { uiStore } from '@/ui/ui-store';

/**
 * 面板系统装配面（T34 M1：内部换源——当前态在 ui store、异步在 panel-controller，
 * 返回形状不变；会话级存档/恢复时机同构保留。消费方自订阅后本 hook 随 M2 退役）。
 */

/** 会话级面板组态档案（模块级，与草稿同档不落盘；当前态在 ui store）。 */
const panelArchive: Record<string, PanelState> = {};

export type PanelTabs = {
  panel: PanelState
  activePanelTab: PanelTab | null
  /** 面板是否有打开的 tab（头部开关按钮的展开态）。 */
  panelOpen: boolean
  togglePanelFromHeader: () => void
  openDiff: () => void
  openAgents: () => void
  toggleDiffPane: () => void
  toggleAgentsPane: () => void
  closePanelTabById: (id: string) => void
  focusPanelTabById: (id: string) => void
  closePanel: () => void
  openFileTab: (path: string) => void
  readFile: typeof readFile
  filePickerOpen: boolean
  filePickerItems: readonly string[]
  setFilePickerOpen: (open: boolean) => void
  openFilePicker: () => void
};

export function usePanelTabs(activeThreadId: string): PanelTabs {
  const panel = useStore(uiStore, (s) => s.panel);
  const filePickerOpen = useStore(uiStore, (s) => s.filePickerOpen);
  const filePickerItems = useStore(uiStore, (s) => s.filePickerItems);

  // 会话级存档/恢复：panel 变化即存档、切会话恢复（与旧实现同构）
  const panelThreadRef = React.useRef(activeThreadId);
  React.useEffect(() => {
    const restore = panelSwitchOutcome(panelArchive, panelThreadRef.current, activeThreadId, panel);
    if (restore === null) return;
    panelThreadRef.current = activeThreadId;
    uiStore.setState({ panel: restore });
  }, [activeThreadId, panel]);

  return React.useMemo(
    () => ({
      panel,
      activePanelTab: panel.tabs.find((tab) => tab.id === panel.activeId) ?? null,
      panelOpen: panel.tabs.length > 0,
      togglePanelFromHeader: () => uiStore.getState().togglePanelFromHeader(),
      openDiff: () => uiStore.getState().openDiffPane(),
      openAgents: () => uiStore.getState().openAgentsPane(),
      toggleDiffPane: () => uiStore.getState().toggleDiffPane(),
      toggleAgentsPane: () => uiStore.getState().toggleAgentsPane(),
      closePanelTabById: (id) => uiStore.getState().closePanelTabById(id),
      focusPanelTabById: (id) => uiStore.getState().focusPanelTabById(id),
      closePanel: () => uiStore.getState().closePanel(),
      openFileTab,
      readFile,
      filePickerOpen,
      filePickerItems,
      setFilePickerOpen: (open) => uiStore.getState().setFilePickerOpen(open),
      openFilePicker,
    }),
    [panel, filePickerOpen, filePickerItems],
  );
}
