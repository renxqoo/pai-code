import { create } from 'zustand';

type SheetName = 'workspace' | 'attachments' | 'task-config' | 'settings-thinking' | 'settings-permission' | 'session-actions' | null;

type NavigationState = {
  drawerOpen: boolean;
  sheet: SheetName;
  setDrawerOpen: (open: boolean) => void;
  openSheet: (sheet: Exclude<SheetName, null>) => void;
  closeSheet: () => void;
};

export const useNavigationStore = create<NavigationState>((set) => ({
  drawerOpen: false,
  sheet: null,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen, ...(drawerOpen ? { sheet: null } : {}) }),
  openSheet: (sheet) => set({ sheet, drawerOpen: false }),
  closeSheet: () => set({ sheet: null }),
}));
