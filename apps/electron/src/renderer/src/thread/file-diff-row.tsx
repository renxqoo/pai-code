import * as React from 'react';

import { ChevronToggle } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { EditHunkList } from './edit-hunk-list';
import { objectName } from './file-object-name';
import { resolveOpen, type CollapsePref } from './collapse-state';
import type { FileDiffGroup } from './edit-file-groups';

type FileDiffRowProps = {
  path: string
  hunks: FileDiffGroup['hunks']
}

/** 单个文件的 diff 行：文件名 + 展开箭头，展开是该文件全部补丁堆叠（默认收起）。 */
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
        <span className="shrink-0 text-[12.5px] leading-[20px] text-muted-foreground">{objectName(path)}</span>
        <ChevronToggle
          open={open}
          variant="disclose"
          className={cn(
            // 紧跟文件名：箭头是这行的展开开关，飘到行尾会与文件名失联
            'ml-[2px] shrink-0',
            open
              ? 'opacity-70'
              : 'opacity-0 transition-opacity duration-150 group-hover:opacity-70 group-focus-within:opacity-70 motion-reduce:transition-none',
          )}
        />
      </button>
      {open ? <EditHunkList hunks={hunks} /> : null}
    </div>
  );
}

export { FileDiffRow };
