import { create } from 'zustand';
import type { PermissionMode, ThinkingLevel } from '@/types/domain';

type ComposerState = {
  draft: string;
  model: string;
  thinking: ThinkingLevel;
  permission: PermissionMode;
  sending: boolean;
  generating: boolean;
  setDraft: (draft: string) => void;
  selectModel: (model: string) => void;
  selectThinking: (thinking: ThinkingLevel) => void;
  selectPermission: (permission: PermissionMode) => void;
  submitDraft: () => boolean;
  toggleGeneration: () => void;
  setGenerating: (generating: boolean) => void;
};

export const useComposerStore = create<ComposerState>((set, get) => ({
  draft: '', model: '', thinking: 'medium', permission: 'edit-confirm', sending: false, generating: false,
  setDraft: (draft) => set({ draft: draft.slice(0, 10000) }),
  selectModel: (model) => set({ model }),
  selectThinking: (thinking) => set({ thinking }),
  selectPermission: (permission) => set({ permission }),
  submitDraft: () => {
    const { draft, sending } = get();
    if (draft.trim().length === 0 || sending) return false;
    set({ sending: false, generating: true, draft: '' });
    return true;
  },
  toggleGeneration: () => set((state) => ({ generating: !state.generating, sending: false })),
  setGenerating: (generating) => set({ generating }),
}));
