import * as React from 'react';
import { Terminal } from 'lucide-react';

import { ChevronToggle } from '@paiapp/ui';

import { copy } from '@/strings';
import { CommandRow } from './command-row';
import type { ToolCallModel } from './thread-model';

type ToolsBlockProps = {
  calls: readonly ToolCallModel[]
  open: boolean
  onToggle: () => void
}

/** 命令块：终端图标 + "Ran N commands" 头行，展开后逐条列出命令。 */
function ToolsBlock({ calls, open, onToggle }: ToolsBlockProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group -ml-[4px] flex w-[calc(100%+4px)] cursor-pointer items-center gap-[10px] rounded-md py-[2px] pr-[4px] pl-[4px] text-left outline-none select-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Terminal className="size-[13px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[20px] text-muted-foreground">
          {copy.flow.commandsSummary(calls.length)}
        </span>
        <ChevronToggle
          open={open}
          variant="disclose"
          className={open ? 'opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60' : 'opacity-70'}
        />
      </button>
      {open ? (
        <div className="mt-[4px] flex flex-col pl-[28px]">
          {calls.map((call) => (
            <CommandRow key={call.id} call={call} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ToolsBlockMemo = React.memo(ToolsBlock);
export { ToolsBlockMemo as ToolsBlock };
