import * as React from 'react';

import { escActionFor, type SidePanel } from './esc-action';
import type { WorkspaceActions } from '@/live/workspace-actions';

type UseEscDismissInput = {
  dialogCount: number;
  sidebarSearchOpen: boolean;
  usageOpen: boolean;
  newThreadOpen: boolean;
  settingsOpen: boolean;
  panel: SidePanel;
  bashRunning: boolean;
  confirmStop: boolean;
  generating: boolean;
  agentsActive: boolean;
  abortBash: WorkspaceActions['abortBash'];
  stopActiveTurn: WorkspaceActions['stopActiveTurn'];
  onSidebarSearchClose: () => void;
  onUsageClose: () => void;
  onNewThreadClose: () => void;
  onSettingsClose: () => void;
  onPanelClose: () => void;
  onConfirmStopChange: (open: boolean) => void;
};

/** Esc 键全局分发（语义裁决在 escActionFor 纯函数，本 hook 只做动作映射）。
 * 裁决输入与分发函数全量进依赖：actions 稳定化后本 effect 不再每渲染重挂，漏依赖即闭包陈旧。 */
export function useEscDismiss(input: UseEscDismissInput): void {
  const { dialogCount, sidebarSearchOpen, usageOpen, newThreadOpen, settingsOpen, panel, bashRunning, confirmStop, generating, agentsActive } = input;
  const { abortBash, stopActiveTurn, onSidebarSearchClose, onUsageClose, onNewThreadClose, onSettingsClose, onPanelClose, onConfirmStopChange } = input;
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const action = escActionFor({ dialogCount, sidebarSearchOpen, usageOpen, newThreadOpen, settingsOpen, panel, bashRunning, confirmStop, generating, agentsActive });
      switch (action.kind) {
        case 'close-sidebar-search':
          onSidebarSearchClose();
          break;
        case 'close-usage':
          onUsageClose();
          break;
        case 'close-new-thread':
          onNewThreadClose();
          break;
        case 'close-settings':
          onSettingsClose();
          break;
        case 'close-panel':
          onPanelClose();
          break;
        case 'abort-bash':
          abortBash();
          break;
        case 'execute-confirmed-stop':
          onConfirmStopChange(false);
          stopActiveTurn();
          break;
        case 'ask-confirm-stop':
          onConfirmStopChange(true);
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
  }, [dialogCount, sidebarSearchOpen, usageOpen, newThreadOpen, settingsOpen, panel, bashRunning, confirmStop, generating, agentsActive, abortBash, stopActiveTurn, onSidebarSearchClose, onUsageClose, onNewThreadClose, onSettingsClose, onPanelClose, onConfirmStopChange]);
}
