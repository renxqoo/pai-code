import { X } from 'lucide-react';

import { copy } from '@/strings';

type NoticeStripProps = {
  notices: readonly { id: string; text: string }[];
  onDismiss: (id: string) => void;
};

/** 瞬时通知条（notify 对话框/发送失败等），自动堆叠上限 5 条。 */
function NoticeStrip({ notices, onDismiss }: NoticeStripProps) {
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[46px] z-[60] flex flex-col items-center gap-[6px]">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="pointer-events-auto flex max-w-[560px] items-center gap-[10px] rounded-[10px] border border-border bg-background/95 px-[12px] py-[7px] text-[12px] leading-[18px] text-foreground shadow-[0_8px_20px_-10px_rgba(24,24,28,0.35)]"
        >
          <span className="min-w-0 flex-1 break-words">{notice.text}</span>
          <button type="button" aria-label={copy.notices.dismiss} onClick={() => onDismiss(notice.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="size-[13px]" strokeWidth={1.75} />
          </button>
        </div>
      ))}
    </div>
  );
}

export { NoticeStrip };
