import * as React from 'react';

import { ChevronToggle } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { toolGroupIcon } from './tool-icons';
import { toolCopy } from '@/strings/tool-copy';
import { chevronRevealClass } from './collapse-state';
import { ProcessRailIcon } from './process-rail-icon';
import { toolGroupLabel, toolGroupStatus } from '@paiapp/ui-thread';
import type { ToolCallModel } from './thread-model';

type ToolGroupHeaderProps = {
  calls: readonly ToolCallModel[]
  open: boolean
  onToggle: () => void
}

/**
 * 并行执行组的标题行：图标（类别语义——有编辑是铅笔、全阅读是书、全命令是终端、
 * 其余混合/未知是扳手）+ 合成标题（「编辑了文件运行了命令」）+ 行内箭头。
 * 标题与工具行同为弱化灰：执行过程是正文之外的注脚，不是主角。
 */
function ToolGroupHeader({ calls, open, onToggle }: ToolGroupHeaderProps) {
  const running = toolGroupStatus(calls) === 'running';
  const Icon = toolGroupIcon(calls);
  return (
    <div className="group flex items-center gap-[6px]">
      <ProcessRailIcon>
        <Icon
          // 同 ToolCallRow：shimmer 是文字技法，作用在 SVG 上会让描边消失
          className="size-[13px] shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-label={copy.flow.groupTitleAria}
        />
      </ProcessRailIcon>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-[6px] rounded-md px-[2px] py-[1px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            'shrink-0 text-[12.5px] leading-[20px] font-medium',
            running ? 'shimmer-text' : 'text-muted-foreground',
          )}
        >
          {toolGroupLabel(calls, toolCopy())}
        </span>
        <ChevronToggle open={open} variant="disclose" className={chevronRevealClass(open)} />
      </button>
    </div>
  );
}

export { ToolGroupHeader };
