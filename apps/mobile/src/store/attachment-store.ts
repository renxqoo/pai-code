import { create } from 'zustand';
import type { Attachment } from '@/types/domain';

type AttachmentState = {
  items: readonly Attachment[];
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  markFailed: (id: string) => void;
};

export const useAttachmentStore = create<AttachmentState>((set) => ({
  items: [],
  addAttachment: (attachment) => set((state) => ({
    items: [...state.items.filter((item) => item.id !== attachment.id), attachment],
  })),
  removeAttachment: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clearAttachments: () => set({ items: [] }),
  markFailed: (id) => set((state) => ({ items: state.items.map((item) => item.id === id ? { ...item, status: 'failed' } : item) })),
}));
