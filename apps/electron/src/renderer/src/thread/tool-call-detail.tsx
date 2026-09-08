import * as React from 'react';

import { CopyButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';
import { detailOutput } from './call-detail';
import type { ToolCallModel } from './thread-model';

type ToolCallDetailProps = {
  call: ToolCallModel
};

/** 工具单元详情：输出面板（标签 + 复制 + 定高滚动）；复制入口复制全量，运行中面板只展示尾部流。 */
function ToolCallDetail({ call }: ToolCallDetailProps) {
  return (
    <div className="mb-[8px] mt-[2px] overflow-hidden rounded-[8px] border border-border bg-surface-subtle">
      <div className="flex items-center justify-end gap-[6px] border-b border-border px-[8px] py-[3px]">
        {call.status === 'running' ? (
          <span aria-hidden="true" className="size-[5px] animate-pulse rounded-full bg-dot-active motion-reduce:animate-none" />
        ) : null}
        <span className="text-[11px] leading-[16px] text-muted-foreground/80">{copy.flow.outputLabel}</span>
        <CopyButton
          label={copy.flow.copyOutput}
          copiedLabel={copy.flow.copied}
          value={call.output}
          onCopy={writeClipboardText}
        />
      </div>
      <pre className="max-h-[176px] overflow-auto px-[10px] py-[8px] font-mono text-[11px] leading-[17px] whitespace-pre-wrap break-words text-muted-foreground">
        {detailOutput(call)}
      </pre>
    </div>
  );
}

export { ToolCallDetail };
