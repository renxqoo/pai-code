import * as React from 'react';

import { ChevronToggle, DurationTag } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { formatElapsed } from './format-elapsed';
import { autoOpenForCall, callExpandable } from './call-detail';
import { toolKindOf, toolPreviewMono, type ToolKind } from './tool-kind';
import { ToolCallDetail } from './tool-call-detail';
import { ToolStatusIcon } from './tool-status-icon';
import { resolveOpen, type CollapsePref } from './collapse-state';
import type { ToolCallModel } from './thread-model';

type ToolCallRowProps = {
  call: ToolCallModel
};

/** 类型标识：人话标签；未知工具不翻译，直接显示原始工具名。 */
function toolLabel(kind: ToolKind, name: string): string {
  switch (kind) {
    case 'bash':
      return copy.flow.labelBash;
    case 'read':
      return copy.flow.labelRead;
    case 'edit':
      return copy.flow.labelEdit;
    case 'write':
      return copy.flow.labelWrite;
    case 'search':
      return copy.flow.labelSearch;
    case 'list':
      return copy.flow.labelList;
    case 'subagent':
      return copy.flow.labelSubagent;
    case 'other':
      return name;
  }
}

/**
 * 单个执行单元行：状态图标（骑在过程组竖轨上）+ 类型标签 + 参数摘要 + 行尾状态/耗时，
 * 有输出时可展开详情。开合 = 手动意图优先，无意图跟随自动策略（运行中看流式尾部、失败常开）。
 */
function ToolCallRow({ call }: ToolCallRowProps) {
  const [pref, setPref] = React.useState<CollapsePref>(null);
  const open = resolveOpen(pref, autoOpenForCall(call));
  const expandable = callExpandable(call);
  const kind = toolKindOf(call.name);
  const failed = call.status === 'failed';
  const running = call.status === 'running';

  const content = (
    <>
      <span
        className={cn(
          'shrink-0 text-[12.5px] leading-[20px] font-medium',
          running ? 'shimmer-text' : 'text-foreground/75',
        )}
      >
        {toolLabel(kind, call.name)}
      </span>
      <span
        title={call.argsPreview}
        className={cn(
          'min-w-0 flex-1 truncate',
          toolPreviewMono(kind) ? 'font-mono text-[12.5px]' : 'text-[12.5px]',
          running ? 'shimmer-text' : failed ? 'text-diff-del' : 'text-muted-foreground',
        )}
      >
        {call.argsPreview}
      </span>
      {call.status === 'failed' ? (
        <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-del">
          {copy.flow.toolFailed(call.exitCode ?? 1)}
        </span>
      ) : call.status === 'stopped' ? (
        <span className="shrink-0 text-[11px] leading-none text-muted-foreground/70">{copy.flow.toolStopped}</span>
      ) : call.status === 'ok' && call.durationMs !== null ? (
        <DurationTag>{formatElapsed(call.durationMs)}</DurationTag>
      ) : null}
      {expandable ? <ChevronToggle open={open} className="shrink-0 opacity-70" /> : null}
    </>
  );

  return (
    <div className="relative flex flex-col">
      <span
        aria-hidden="true"
        className="absolute top-[3px] -left-[26px] flex h-[18px] w-[26px] shrink-0 items-center justify-center bg-background"
      >
        <ToolStatusIcon status={call.status} />
      </span>
      <div className="flex min-h-[26px] items-center">
        {expandable ? (
          <button
            type="button"
            onClick={() => setPref(!open)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-[8px] rounded-md px-[6px] py-[3px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {content}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-[8px] px-[6px] py-[3px]">{content}</div>
        )}
      </div>
      {expandable && open ? <ToolCallDetail call={call} /> : null}
    </div>
  );
}

export { ToolCallRow };
