import * as React from 'react';
import { useStore } from 'zustand';

import { escActionFor } from './esc-action';
import { closeProjectFiles } from '@/sidebar/project-files';
import type { WorkspaceActions } from '@/live/workspace-actions';
import { uiStore } from '@/ui/ui-store';

/** ui store 拥有的覆盖层开合（含停止确认条）在本 hook 内自订阅自派发（引用恒定的模块动作）；
 * 其余裁决输入（hub 对话框/命令面板/右侧面板/线程运行面）仍由调用方喂。 */
const { closeSidebarSearch, closeSettings, closeUsage, closeNewTask, setConfirmStop } = uiStore.getState();

type UseEscDismissInput = {
  /** 对话框总数（hub 对话框 + 新建任务页内浮层：浮层自行消费 Esc，不穿透关闭整页）。 */
  dialogCount: number;
  paletteOpen: boolean;
  onPaletteClose: () => void;
  /** 右侧面板容器有任一 tab（整组收起）。 */
  panelOpen: boolean;
  onPanelClose: () => void;
  bashRunning: boolean;
  generating: boolean;
  agentsActive: boolean;
  abortBash: WorkspaceActions['abortBash'];
  stopActiveTurn: WorkspaceActions['stopActiveTurn'];
};

/** Esc 键全局分发（语义裁决在 escActionFor 注册表，本 hook 只做动作映射）。
 * 裁决输入与分发函数全量进依赖：actions 稳定化后本 effect 不再每渲染重挂，漏依赖即闭包陈旧。 */
export function useEscDismiss(input: UseEscDismissInput): void {
  const { dialogCount, paletteOpen, panelOpen, bashRunning, generating, agentsActive } = input;
  const { abortBash, stopActiveTurn, onPaletteClose, onPanelClose } = input;
  const confirmStop = useStore(uiStore, (s) => s.confirmStop);
  /** 侧栏内嵌层只以可见性参与（侧栏收起时不可见的搜索/面板不吞 Esc）。 */
  const sidebarSearchOpen = useStore(uiStore, (s) => s.sidebarSearchOpen && !s.sidebarCollapsed);
  const projectFilesOpen = useStore(uiStore, (s) => s.projectFiles.target !== null && !s.sidebarCollapsed);
  const usageOpen = useStore(uiStore, (s) => s.usageOpen);
  const newTaskOpen = useStore(uiStore, (s) => s.newTaskOpen);
  const settingsOpen = useStore(uiStore, (s) => s.settingsOpen);
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const action = escActionFor({ dialogCount, paletteOpen, sidebarSearchOpen, usageOpen, projectFilesOpen, newTaskOpen, settingsOpen, panelOpen, bashRunning, confirmStop, generating, agentsActive });
      switch (action.kind) {
        case 'close-palette':
          onPaletteClose();
          break;
        case 'close-sidebar-search':
          closeSidebarSearch();
          break;
        case 'close-usage':
          closeUsage();
          break;
        case 'close-project-files':
          closeProjectFiles();
          break;
        case 'close-new-task':
          closeNewTask();
          break;
        case 'close-settings':
          closeSettings();
          break;
        case 'close-panel':
          onPanelClose();
          break;
        case 'abort-bash':
          abortBash();
          break;
        case 'execute-confirmed-stop':
          setConfirmStop(false);
          stopActiveTurn();
          break;
        case 'ask-confirm-stop':
          setConfirmStop(true);
          break;
        case 'stop-turn':
          stopActiveTurn();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogCount, paletteOpen, sidebarSearchOpen, usageOpen, projectFilesOpen, newTaskOpen, settingsOpen, panelOpen, bashRunning, confirmStop, generating, agentsActive, abortBash, stopActiveTurn, onPaletteClose, onPanelClose]);
}
