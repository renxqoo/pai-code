import * as React from 'react';

import { readProjectFile } from '@/live/file-actions';
import { bridgeClient } from '@/live/workspace-runtime';
import {
  closeAllPanels,
  closePanelTab,
  fileTab,
  focusPanelTab,
  openPanel,
  singletonTab,
  togglePanel,
  EMPTY_PANEL,
  type PanelState,
  type PanelTab,
} from '@/panel/panel-state';

/**
 * 面板系统装配（workspace-main 的面板子域）：多标签状态 + 会话级记忆 +
 * 单例 tab 开关/切换 + 文件 tab + 「打开文件…」选择弹窗。切会话时旧会话
 * 组态存档、新会话恢复（模块级 uiState，与草稿同档不落盘）。
 */

const panelByThread: Record<string, PanelState> = {};

/** 面板系统装配面（hook 返回形状；PanelLayer 渲染消费）。 */
export type PanelTabs = {
  panel: PanelState
  activePanelTab: PanelTab | null
  openDiff: () => void
  openAgents: () => void
  toggleDiffPane: () => void
  toggleAgentsPane: () => void
  closePanelTabById: (id: string) => void
  focusPanelTabById: (id: string) => void
  closePanel: () => void
  openFileTab: (path: string) => void
  readFile: (cwd: string, path: string) => Promise<{ ok: true; data: { content: string; truncated: boolean; size: number } } | { ok: false; reason: string }>
  filePickerOpen: boolean
  filePickerItems: readonly string[]
  setFilePickerOpen: (open: boolean) => void
  openFilePicker: () => void
};

export function usePanelTabs(
  activeThreadId: string,
  activeCwd: string,
  searchFilesIn: (cwd: string, query: string) => Promise<string[] | null>,
): PanelTabs {
  const [panel, setPanel] = React.useState<PanelState>(EMPTY_PANEL);
  const panelThreadRef = React.useRef(activeThreadId);
  React.useEffect(() => {
    if (panelThreadRef.current === activeThreadId) {
      panelByThread[activeThreadId] = panel;
      return;
    }
    // 切会话：旧会话面板组态存档后恢复新会话的
    panelByThread[panelThreadRef.current] = panel;
    panelThreadRef.current = activeThreadId;
    setPanel(panelByThread[activeThreadId] ?? EMPTY_PANEL);
  }, [activeThreadId, panel]);

  const openDiff = React.useCallback(() => setPanel((current) => openPanel(current, singletonTab('diff'))), []);
  const openAgents = React.useCallback(() => setPanel((current) => openPanel(current, singletonTab('agents'))), []);
  const openFileTab = React.useCallback(
    (path: string) => setPanel((current) => openPanel(current, fileTab(activeCwd, path))),
    [activeCwd],
  );
  const readFile = React.useCallback((cwd: string, path: string) => readProjectFile(bridgeClient, cwd, path), []);

  /** 「打开文件…」选择弹窗：进入时拉一次全量清单，cmdk 客户端过滤。 */
  const [filePickerOpen, setFilePickerOpen] = React.useState(false);
  const [filePickerItems, setFilePickerItems] = React.useState<readonly string[]>([]);
  const openFilePicker = React.useCallback(() => {
    setFilePickerItems([]);
    setFilePickerOpen(true);
    void searchFilesIn(activeCwd, '').then((paths) => {
      if (paths !== null) setFilePickerItems(paths);
    });
  }, [searchFilesIn, activeCwd]);

  return {
    panel,
    activePanelTab: panel.tabs.find((tab) => tab.id === panel.activeId) ?? null,
    openDiff,
    openAgents,
    toggleDiffPane: React.useCallback(() => setPanel((current) => togglePanel(current, 'diff')), []),
    toggleAgentsPane: React.useCallback(() => setPanel((current) => togglePanel(current, 'agents')), []),
    closePanelTabById: React.useCallback((id: string) => setPanel((current) => closePanelTab(current, id)), []),
    focusPanelTabById: React.useCallback((id: string) => setPanel((current) => focusPanelTab(current, id)), []),
    closePanel: React.useCallback(() => setPanel(closeAllPanels()), []),
    openFileTab,
    readFile,
    filePickerOpen,
    filePickerItems,
    setFilePickerOpen,
    openFilePicker,
  };
}
