import { ArrowUpFromLine, GripVertical, Pencil, Trash2 } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { cn } from '@/lib/utils';

type QueuedMessageCardProps = {
  text: string
  /** 「立即」胶囊文案（立即改向当前轮；提供 onSendNow 时渲染） */
  sendNowLabel?: string
  /** 铅笔按钮的无障碍名（回填草稿编辑；提供 onEdit 时渲染） */
  editLabel?: string
  /** 垃圾桶按钮的无障碍名（丢弃该条；提供 onRemove 时渲染） */
  removeLabel?: string
  onSendNow?: () => void
  onEdit?: () => void
  onRemove?: () => void
}

/** 生成中的排队消息卡片：拖拽手柄（装饰）+ 单行预览 + 动作位（可选——hub 队列
 *  镜像来源只读呈现，无单条操作；本地可操作来源才带立即改向 / 编辑 / 移除）。
 *  灰底横条贴输入卡顶部渲染，多条时纵向堆叠（旧→新，最新一条贴输入框）。 */
function QueuedMessageCard({ text, sendNowLabel, editLabel, removeLabel, onSendNow, onEdit, onRemove }: QueuedMessageCardProps) {
  return (
    <div className="flex items-center gap-[12px] bg-muted py-2 pr-4 pl-4">
      <GripVertical aria-hidden="true" className="mr-[6px] size-[13px] shrink-0 text-muted-foreground/50 strokeWidth={2}" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[18px] text-foreground">{text}</span>
      {onSendNow !== undefined ? (
        <button
          type="button"
          onClick={onSendNow}
          className={cn(
            'flex h-[26px] shrink-0 cursor-pointer items-center gap-[7px] rounded-[8px] bg-foreground/5 px-[10px]',
            'text-[12px] leading-none text-foreground outline-none select-none',
            'hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50',
          )}
        >
          <ArrowUpFromLine className="size-[13px]" strokeWidth={2} />
          <span className="whitespace-nowrap">{sendNowLabel}</span>
        </button>
      ) : null}
      {(onEdit !== undefined || onRemove !== undefined) && (
        <div className="flex shrink-0 items-center gap-[6px]">
          {onEdit !== undefined && editLabel !== undefined ? (
            <IconButton label={editLabel} size="sm" onClick={onEdit} className="text-foreground/90">
              <Pencil strokeWidth={1.75} />
            </IconButton>
          ) : null}
          {onRemove !== undefined && removeLabel !== undefined ? (
            <IconButton label={removeLabel} size="sm" onClick={onRemove} className="text-foreground/90">
              <Trash2 strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </div>
      )}
    </div>
  );
}

export { QueuedMessageCard };
