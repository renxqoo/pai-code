import * as React from 'react';
import { Pencil } from 'lucide-react';

import { ChevronToggle } from '@paiapp/ui';

import { copy } from '@/strings';
import { EditHunkList } from './edit-hunk-list';
import { objectName } from './file-object-name';
import { chevronRevealClass, resolveOpen, type CollapsePref } from './collapse-state';
import type { FileDiffGroup } from './edit-file-groups';

type FileDiffRowProps = {
  path: string
  hunks: FileDiffGroup['hunks']
}

/**
 * 单个文件的 diff 行。**与执行行同形态**（图标 + 动作 + 文件名 + 箭头）：
 * 这行展示的就是上面那些执行行做的编辑，同一件事不该有两种长相——
 * 一个带图标带动作、一个光秃秃只剩文件名，读起来像两样东西。
 * 图标恒为铅笔（这里只可能是编辑），动作恒为「已编辑」（渲染时机即已落定）。
 */
function FileDiffRow({ path, hunks }: FileDiffRowProps) {
  const [pref, setPref] = React.useState<CollapsePref>(null);
  const open = resolveOpen(pref, false);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setPref(!open)}
        aria-expanded={open}
        className="group flex cursor-pointer items-center gap-[6px] rounded-md px-[2px] py-[1px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Pencil className="size-[13px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="shrink-0 text-[12.5px] leading-[20px] font-medium text-muted-foreground">
          {copy.flow.rowDoneEdit}
        </span>
        <span className="min-w-0 shrink break-words font-mono text-[12.5px] leading-[20px] text-muted-foreground">
          {objectName(path)}
        </span>
        {/* 箭头紧跟文件名：它是这行的展开开关，飘到行尾会与文件名失联 */}
        <ChevronToggle open={open} variant="disclose" className={chevronRevealClass(open)} />
      </button>
      {open ? <EditHunkList hunks={hunks} /> : null}
    </div>
  );
}

export { FileDiffRow };
