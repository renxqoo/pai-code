import * as React from 'react';

import { CopyButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { writeClipboardText } from '@/lib/clipboard';
import { detailOutput } from './call-detail';
import { toolSummary } from './tool-summary';
import type { ToolCallModel } from './thread-model';

type OutputPanelProps = {
  call: Pick<ToolCallModel, 'argsPreview' | 'output' | 'status'>
}

/**
 * 通用输出面板：命令回显 / 搜索命中 / 目录列举 / write 结果等的输出
 * （参数摘要 + 输出标签 + 复制 + 定高滚动）；运行中只展示头部流片段。
 */
function OutputPanel({ call }: OutputPanelProps) {
  const running = call.status === 'running';
  return (
    <div className="mb-[8px] overflow-hidden rounded-[8px] border border-border bg-surface-subtle">
      <div className="flex items-center gap-[8px] border-b border-border px-[8px] py-[3px]">
        <span
          title={call.argsPreview}
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-[11px] leading-[16px]',
            running ? 'shimmer-text' : 'text-muted-foreground/60',
          )}
        >
          {toolSummary(call.argsPreview)}
        </span>
        <span
          className={cn(
            'shrink-0 text-[11px] leading-[16px]',
            running ? 'shimmer-text' : 'text-muted-foreground/80',
          )}
        >
          {copy.flow.outputLabel}
        </span>
        <CopyButton
          label={copy.flow.copyOutput}
          copiedLabel={copy.flow.copied}
          value={call.output}
          onCopy={writeClipboardText}
        />
      </div>
      <pre className="max-h-[176px] overflow-auto px-[10px] py-[8px] font-mono text-[11px] leading-[17px] whitespace-pre-wrap break-words text-muted-foreground">
        {detailOutput(call as ToolCallModel)}
      </pre>
    </div>
  );
}

export { OutputPanel };
