import { Plus } from 'lucide-react';

type ThreadTabsProps = {
  addLabel: string
  onAdd: () => void
}

/** 顶部跨栏标签行：面板入口在对话流块内（打开 Diff / 打开 Agents），此处仅保留添加入口。 */
function ThreadTabs({ addLabel, onAdd }: ThreadTabsProps) {
  return (
    <div className="flex shrink-0 items-center gap-[3px]">
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        title={addLabel}
        className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none select-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-[13px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export { ThreadTabs };
