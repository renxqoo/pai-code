import type { QuickTask } from '@/screens/new-task-view-model';

import { Button } from '@/components/ui/button';

type QuickTaskChipsProps = {
  items: readonly QuickTask[]
  /** 点击只预填提示词到输入框（不自动发送） */
  onSelect: (prompt: string) => void
}

/** 新建任务页快捷任务胶囊行：点击预填草稿。 */
function QuickTaskChips({ items, onSelect }: QuickTaskChipsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-[8px]">
      {items.map((item) => (
        <Button
          key={item.label}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(item.prompt)}
          className="rounded-full border-border/70 bg-background/60 px-[14px] text-[12px] font-normal text-muted-foreground hover:text-foreground"
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

export { QuickTaskChips };
export type { QuickTaskChipsProps };
