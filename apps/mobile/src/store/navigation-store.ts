import { create } from 'zustand';

type SheetName = 'workspace' | 'attachments' | 'task-settings' | 'permission' | 'context' | 'session-actions' | 'message-actions' | null;
type RootTab = 'chat' | 'search' | 'settings';

type NavigationState = {
  drawerOpen: boolean;
  sheet: SheetName;
  tab: RootTab;
  setDrawerOpen: (open: boolean) => void;
  openSheet: (sheet: Exclude<SheetName, null>) => void;
  closeSheet: () => void;
  setTab: (tab: RootTab) => void;
};

export const useNavigationStore = create<NavigationState>((set) => ({
  drawerOpen: false,
  sheet: null,
  tab: 'chat',
  setDrawerOpen: (drawerOpen) => set({ drawerOpen, ...(drawerOpen ? { sheet: null } : {}) }),
  openSheet: (sheet) => set({ sheet, drawerOpen: false }),
  closeSheet: () => set({ sheet: null }),
  setTab: (tab) => set({ tab, drawerOpen: false }),
}));
