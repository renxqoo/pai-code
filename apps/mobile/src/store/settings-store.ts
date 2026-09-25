import { create } from 'zustand';
import type { PermissionMode, ThemePreference, ThinkingLevel } from '@/types/domain';

type SettingsState = {
  theme: ThemePreference;
  locale: 'zh-CN';
  defaultModel: string;
  defaultThinking: ThinkingLevel;
  defaultPermission: PermissionMode;
  notifications: boolean;
  haptics: boolean;
  compactHistory: boolean;
  setTheme: (theme: ThemePreference) => void;
  setDefaultModel: (model: string) => void;
  setDefaultThinking: (thinking: ThinkingLevel) => void;
  setDefaultPermission: (permission: PermissionMode) => void;
  toggleNotifications: () => void;
  toggleHaptics: () => void;
  toggleCompactHistory: () => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'system', locale: 'zh-CN', defaultModel: 'gpt-5.2-codex', defaultThinking: 'medium', defaultPermission: 'ask',
  notifications: true, haptics: true, compactHistory: false,
  setTheme: (theme) => set({ theme }),
  setDefaultModel: (defaultModel) => set({ defaultModel: defaultModel.trim() || 'gpt-5.2-codex' }),
  setDefaultThinking: (defaultThinking) => set({ defaultThinking }),
  setDefaultPermission: (defaultPermission) => set({ defaultPermission }),
  toggleNotifications: () => set((state) => ({ notifications: !state.notifications })),
  toggleHaptics: () => set((state) => ({ haptics: !state.haptics })),
  toggleCompactHistory: () => set((state) => ({ compactHistory: !state.compactHistory })),
}));
