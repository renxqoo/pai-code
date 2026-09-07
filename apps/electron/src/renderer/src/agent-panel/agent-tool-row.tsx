import { DurationTag } from '@paiapp/ui';

import { copy } from '@/strings';
import { formatElapsed } from '@/thread/format-elapsed';
import type { ToolCallModel } from '@/thread/thread-model';

type AgentToolRowProps = {
  call: ToolCallModel
}

/** 面板展开后的单条工具明细：工具名 + 参数摘要 + 状态/耗时。 */
function AgentToolRow({ call }: AgentToolRowProps) {
  return (
    <div className="flex h-[20px] items-center gap-[8px]">
      <span className="shrink-0 font-mono text-[10.5px] leading-none text-muted-foreground">{call.name}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] leading-none text-meta-faint">
        {call.argsPreview}
      </span>
      {call.status === 'running' ? (
        <span
          aria-label={copy.flow.toolRunning}
          className="size-[5px] shrink-0 animate-pulse rounded-full bg-dot-active motion-reduce:animate-none"
        />
      ) : call.status === 'stopped' ? (
        <span className="shrink-0 text-[10px] leading-none text-muted-foreground/70">{copy.flow.toolStopped}</span>
      ) : call.durationMs !== null ? (
        <DurationTag className={call.status === 'failed' ? 'text-diff-del' : undefined}>
          {formatElapsed(call.durationMs)}
        </DurationTag>
      ) : null}
    </div>
  );
}

export { AgentToolRow };
