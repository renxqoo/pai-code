import { X } from 'lucide-react';

type AttachmentChipsProps = {
  items: ReadonlyArray<{ id: number; preview: string; name: string }>
  removeLabel: string
  onRemove: (id: number) => void
}

/** 图片附件预览行：data URL 缩略图 + 移除入口。 */
function AttachmentChips({ items, removeLabel, onRemove }: AttachmentChipsProps) {
  return (
    <div className="flex flex-wrap gap-[8px] px-4 pt-2">
      {items.map((item) => (
        <div key={item.id} className="group/attach relative size-[46px] overflow-hidden rounded-[8px] border border-border">
          <img src={item.preview} alt={item.name} className="size-full object-cover" />
          <button
            type="button"
            aria-label={removeLabel}
            title={removeLabel}
            onClick={() => onRemove(item.id)}
            className="absolute top-[2px] right-[2px] hidden rounded-[4px] bg-background/85 p-[2px] text-muted-foreground hover:text-foreground group-hover/attach:block"
          >
            <X className="size-[11px]" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}

export { AttachmentChips };
