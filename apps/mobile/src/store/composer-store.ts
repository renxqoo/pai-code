import { create } from 'zustand';
import type { PermissionMode, ThinkingLevel } from '@/types/domain';

type ComposerState = {
  draft: string;
  model: string;
  thinking: ThinkingLevel;
  permission: PermissionMode;
  sending: boolean;
  generating: boolean;
  contextPercent: number;
  setDraft: (draft: string) => void;
  selectModel: (model: string) => void;
  selectThinking: (thinking: ThinkingLevel) => void;
  selectPermission: (permission: PermissionMode) => void;
  submitDraft: () => boolean;
  toggleGeneration: () => void;
  setContextPercent: (percent: number) => void;
};

export const useComposerStore = create<ComposerState>((set, get) => ({
  draft: '', model: 'gpt-5.2-codex', thinking: 'medium', permission: 'ask', sending: false, generating: false, contextPercent: 24,
  setDraft: (draft) => set({ draft: draft.slice(0, 10000) }),
  selectModel: (model) => set({ model }),
  selectThinking: (thinking) => set({ thinking }),
  selectPermission: (permission) => set({ permission }),
  submitDraft: () => {
    const { draft, sending } = get();
    if (draft.trim().length === 0 || sending) return false;
    set({ sending: false, draft: '' });
    return true;
  },
  toggleGeneration: () => set((state) => ({ generating: !state.generating, sending: false })),
  setContextPercent: (contextPercent) => set({ contextPercent: Math.max(0, Math.min(100, Math.round(contextPercent))) }),
}));
