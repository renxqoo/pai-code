import * as React from 'react';

import { CopyButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { writeClipboardText } from '@/lib/clipboard';
import { fileLines, readFooterHint } from './file-lines';
import { toolSummary } from './tool-summary';
import type { ToolCallModel } from './thread-model';

type FileContentPanelProps = {
  call: Pick<ToolCallModel, 'argsPreview' | 'output' | 'status'>
}

/**
 * 文件内容面板（read 工具的详情）：行号列 + 内容列，只展示这次读到的内容——
 * read 的返回本就带行号（offset/limit 窗口），行号让「读到哪儿了」一眼可见。
 * 末尾带续读提示时（read 工具的 offset 提示）原样透出；复制入口复制原始输出。
 */
function FileContentPanel({ call }: FileContentPanelProps) {
  const running = call.status === 'running';
  const lines = fileLines(call.output);
  const hint = readFooterHint(call.output);
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
          {copy.flow.fileContentLabel}
        </span>
        <CopyButton
          label={copy.flow.copyOutput}
          copiedLabel={copy.flow.copied}
          value={call.output}
          onCopy={writeClipboardText}
        />
      </div>
      <div className="max-h-[176px] overflow-auto px-[0px] py-[6px] font-mono text-[11px] leading-[17px]">
        {lines.map((line) => (
          <div key={line.number} className="flex whitespace-pre-wrap break-words">
            <span
              aria-hidden="true"
              className={cn(
                'sticky left-0 w-[38px] shrink-0 bg-surface-subtle pr-[8px] text-right tabular-nums select-none',
                running ? 'shimmer-text' : 'text-muted-foreground/40',
              )}
            >
              {line.number}
            </span>
            <span className={cn('min-w-0 pr-[10px]', running ? 'shimmer-text' : 'text-muted-foreground')}>{line.text}</span>
          </div>
        ))}
        {hint !== null ? (
          <div className="border-t border-border px-[10px] pt-[4px] text-muted-foreground/50">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

export { FileContentPanel };
