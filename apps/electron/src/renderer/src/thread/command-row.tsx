import * as React from 'react';

import { ChevronToggle, CopyButton, DurationTag } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';
import { formatElapsed } from './format-elapsed';
import type { ToolCallModel } from './thread-model';

type CommandRowProps = {
  call: ToolCallModel
};

function statusTag(call: ToolCallModel) {
  if (call.status === 'running') {
    return (
      <span
        aria-label={copy.flow.toolRunning}
        title={copy.flow.toolRunning}
        className="size-[6px] shrink-0 animate-pulse rounded-full bg-dot-active motion-reduce:animate-none"
      />
    );
  }
  if (call.status === 'failed') {
    return (
      <span className="shrink-0 font-mono text-[10.5px] leading-none tabular-nums text-diff-del">
        {copy.flow.toolFailed(call.exitCode ?? 1)}
      </span>
    );
  }
  if (call.status === 'stopped') {
    return <span className="shrink-0 text-[10.5px] leading-none text-muted-foreground/70">{copy.flow.toolStopped}</span>;
  }
  if (call.durationMs === null) return null;
  return <DurationTag>{formatElapsed(call.durationMs)}</DurationTag>;
}

/** 单条命令行：命令文本 + 状态/耗时 + 独立的输出折叠，与外层命令块互不干扰。 */
function CommandRow({ call }: CommandRowProps) {
  const [open, setOpen] = React.useState(false);
  const hasOutput = call.output.length > 0;
  const failed = call.status === 'failed';

  return (
    <div className="flex flex-col">
      <div className="flex min-h-[24px] items-center gap-[10px]">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="min-w-0 flex-1 cursor-pointer text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className={`block truncate text-[12.5px] leading-[24px] ${failed ? 'text-diff-del' : 'text-muted-foreground'}`}>
            {call.argsPreview}
          </span>
        </button>
        {statusTag(call)}
        {hasOutput ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-label={copy.flow.toggleOutput}
            aria-expanded={open}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 outline-none transition-colors select-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronToggle open={open} variant="reveal" />
          </button>
        ) : null}
      </div>
      {open && hasOutput ? (
        <div className="mb-[8px] ml-[2px] overflow-hidden rounded-[8px] border border-border bg-surface-subtle">
          <div className="flex items-center justify-end gap-[6px] border-b border-border px-[8px] py-[3px]">
            <span className="text-[10.5px] leading-[16px] text-muted-foreground/80">{copy.flow.outputLabel}</span>
            <CopyButton
              label={copy.flow.copyOutput}
              copiedLabel={copy.flow.copied}
              value={call.output}
              onCopy={writeClipboardText}
            />
          </div>
          <pre className="max-h-[176px] overflow-auto px-[10px] py-[8px] font-mono text-[11px] leading-[17px] whitespace-pre-wrap text-muted-foreground">
            {call.output}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export { CommandRow };
