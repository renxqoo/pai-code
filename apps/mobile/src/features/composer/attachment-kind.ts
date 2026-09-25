import type { AttachmentKind } from '@/types/domain';

export function kindOf(name: string): AttachmentKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|webp|gif|heic)$/.test(lower)) return 'image';
  if (/\.(zip|tar|gz|7z)$/.test(lower)) return 'archive';
  return 'document';
}
