import { X } from 'lucide-react';

/** 排队消息单行（纯展示，装饰性引导符 + 文本）。 */
function QueueRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-[6px] rounded-[8px] px-[6px] py-[4px] hover:bg-accent/40">
      <X className="mt-[3px] size-[11px] shrink-0 text-muted-foreground/50" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 break-words text-[12.5px] leading-[19px] text-foreground/90">{text}</span>
    </div>
  );
}

export { QueueRow };
