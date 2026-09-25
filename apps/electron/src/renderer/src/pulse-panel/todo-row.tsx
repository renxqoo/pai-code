import * as React from 'react';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';

import type { TodoSnapshotTask } from '@paiapp/contracts';

import { ChevronToggle, TypePill } from '@paiapp/ui';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';

type TodoRowProps = {
  task: TodoSnapshotTask
};

/** 任务状态 → 图标与文案（三值闭包；词表外按 pending 呈现）。 */
function todoStatusOf(status: TodoSnapshotTask['status']): { icon: React.JSX.Element; label: string } {
  if (status === 'completed') {
    return {
      icon: <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-dot-done" strokeWidth={1.75} />,
      label: copy.pulse.todo.statusDone,
    };
  }
  if (status === 'in_progress') {
    return {
      icon: <CircleDot aria-hidden="true" className="size-3.5 shrink-0 text-dot-active" strokeWidth={1.75} />,
      label: copy.pulse.todo.statusDoing,
    };
  }
  return {
    icon: <Circle aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.75} />,
    label: copy.pulse.todo.statusPending,
  };
}

/**
 * todo 任务行：三态图标 + subject（完成态删除线灰化）+ owner 归属 pill；
 * 有 description 的行点击展开/收起描述（无描述为纯展示行）。
 */
function TodoRow({ task }: TodoRowProps) {
  const [open, setOpen] = React.useState(false);
  const description = task.description ?? '';
  const expandable = description.length > 0;
  const status = todoStatusOf(task.status);
  const owner = task.owner ?? '';
  const body = (
    <>
      {status.icon}
      <span className="min-w-0 flex-1">
        <span
          className={cn('block truncate text-[12px] leading-5', task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground')}
          title={task.subject}
        >
          {task.subject}
        </span>
        {open && <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>}
      </span>
      {owner.length > 0 && <TypePill label={owner} />}
      {expandable && <ChevronToggle open={open} />}
    </>
  );
  const rowClassName = 'flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left outline-none select-none';
  return (
    <li title={status.label} aria-label={copy.pulse.todo.rowAria(task.subject)}>
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(rowClassName, 'cursor-pointer hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50')}
        >
          {body}
        </button>
      ) : (
        <div className={rowClassName}>{body}</div>
      )}
    </li>
  );
}

export { TodoRow };
export type { TodoRowProps };
