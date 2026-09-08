import * as React from 'react';
import { Terminal } from 'lucide-react';

import { copy } from '@/strings';
import { CommandRow } from './command-row';
import type { ToolCallModel } from './thread-model';

type ToolsBlockProps = {
  calls: readonly ToolCallModel[]
}

/** 命令块：静态摘要头行（终端图标 + Ran N commands）+ 命令列表，无独立开关。 */
function ToolsBlock({ calls }: ToolsBlockProps) {
  return (
    <div>
      <div className="flex items-center gap-[10px] rounded-md py-[2px] pr-[4px] pl-[4px] text-left select-none">
        <Terminal className="size-[13px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[20px] text-muted-foreground">
          {copy.flow.commandsSummary(calls.length)}
        </span>
      </div>
      <div className="mt-[4px] flex flex-col pl-[28px]">
        {calls.map((call) => (
          <CommandRow key={call.id} call={call} />
        ))}
      </div>
    </div>
  );
}

const ToolsBlockMemo = React.memo(ToolsBlock);
export { ToolsBlockMemo as ToolsBlock };
