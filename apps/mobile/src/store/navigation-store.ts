import { create } from 'zustand';
import type { FileDiffGroup } from '@x3code/ui-thread';
import type { ChatMessage } from '@/types/domain';

type SheetName = 'workspace' | 'attachments' | 'task-config' | 'settings-thinking' | 'settings-permission' | 'session-actions' | null;

type NavigationState = {
  drawerOpen: boolean;
  sheet: SheetName;
  /** 工具详情弹窗载荷：非空即弹出，根级 Sheet 统一渲染 */
  toolDetail: ChatMessage | null;
  /** 文件改动弹窗载荷（同一文件多次编辑合成的 diff）：非空即弹出 */
  fileDiff: FileDiffGroup | null;
  setDrawerOpen: (open: boolean) => void;
  openSheet: (sheet: Exclude<SheetName, null>) => void;
  closeSheet: () => void;
  openToolDetail: (message: ChatMessage) => void;
  closeToolDetail: () => void;
  openFileDiff: (group: FileDiffGroup) => void;
  closeFileDiff: () => void;
};

export const useNavigationStore = create<NavigationState>((set) => ({
  drawerOpen: false,
  sheet: null,
  toolDetail: null,
  fileDiff: null,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen, ...(drawerOpen ? { sheet: null } : {}) }),
  openSheet: (sheet) => set({ sheet, drawerOpen: false }),
  closeSheet: () => set({ sheet: null }),
  openToolDetail: (message) => set({ toolDetail: message, drawerOpen: false }),
  closeToolDetail: () => set({ toolDetail: null }),
  openFileDiff: (group) => set({ fileDiff: group, drawerOpen: false }),
  closeFileDiff: () => set({ fileDiff: null }),
}));
