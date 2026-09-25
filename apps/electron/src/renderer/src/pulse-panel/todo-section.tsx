import type { TodoSnapshotTask } from '@paiapp/contracts';

import { CollapsibleSection } from '@paiapp/ui';
import { copy } from '@/strings';

import { TodoRow } from './todo-row';
import { todoProgressOf } from './pulse-assembly';

type TodoSectionProps = {
  tasks: readonly TodoSnapshotTask[]
  open: boolean
  onOpenChange: (open: boolean) => void
};

/** 进程分区（速览面板）：n/m 进度 meta + 任务行清单；无任务整区隐藏。 */
function TodoSection({ tasks, open, onOpenChange }: TodoSectionProps) {
  if (tasks.length === 0) return null;
  const progress = todoProgressOf(tasks);
  const allDone = progress.done === progress.total;
  return (
    <CollapsibleSection
      open={open}
      onOpenChange={onOpenChange}
      title={copy.pulse.todo.section}
      meta={<span className={allDone ? 'text-dot-done' : undefined}>{copy.pulse.todo.progress(progress.done, progress.total)}</span>}
    >
      <ul className="flex flex-col px-1.5 pb-2">
        {tasks.map((task) => (
          <TodoRow key={task.id} task={task} />
        ))}
      </ul>
    </CollapsibleSection>
  );
}

export { TodoSection };
export type { TodoSectionProps };
