import * as React from 'react';

import { ChevronToggle } from '@paiapp/ui';

import type { SubagentSpawnView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { autoOpenForCall, callExpandable } from './call-detail';
import { toolKindOf, toolPreviewMono } from './tool-kind';
import { toolSummary } from './tool-summary';
import { ToolCallDetail } from './tool-call-detail';
import { ProcessRailIcon } from './process-rail-icon';
import { toolRowIcon } from './tool-row-icon';
import { toolRowLabelOf } from './tool-row-label';
import { chevronRevealClass, resolveOpen, type CollapsePref } from './collapse-state';
import type { ToolCallModel } from './thread-model';

type ToolCallRowProps = {
  call: ToolCallModel
};

/** 行尾状态：失败退出码 / 停止（渲染片段，非独立组件）。
 *  成功不挂耗时——执行过程是脚注，一行一个动作短语就够，秒数只添噪声
 *  （要精确耗时走展开详情与 Agent 面板）。 */
function callTail(call: ToolCallModel) {
  if (call.status === 'failed') {
    return (
      <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-del">
        {copy.flow.toolFailed(call.exitCode ?? 1)}
      </span>
    );
  }
  if (call.status === 'stopped') {
    return <span className="shrink-0 text-[11px] leading-none text-muted-foreground/70">{copy.flow.toolStopped}</span>;
  }
  return null;
}

/**
 * 单个执行单元行：类别图标 + 带状态的动作短语（已阅读文件 / 正在运行命令）
 * + 参数摘要 + 行尾状态，有输出时可展开详情。
 * 参数摘要随容器宽度自适应铺满（flex-1 + 两端 wrap），不设固定上限——
 * 窗口宽时完整展开，窄时才按可用宽度折行。
 * 行整体弱化灰（执行过程是正文之外的注脚）；开合 = 手动意图优先，无意图跟随自动策略
 * （失败常开）；行内箭头收起态 hover 显形、展开态常显。
 * task 工具按参数展开子代理执行清单：每个 spawn 一行（子智能体 + 蓝色等宽 agent 名 + · 任务描述），
 * 行尾状态与展开箭头挂最后一行，各行点击共享同一展开态（明细为该调用的输出，spawn 共享调用终态）；
 * 清单缺失时退回参数摘要单行。
 */
function ToolCallRow({ call }: ToolCallRowProps) {
  const [pref, setPref] = React.useState<CollapsePref>(null);
  const open = resolveOpen(pref, autoOpenForCall(call));
  const expandable = callExpandable(call);
  const kind = toolKindOf(call.name);
  const failed = call.status === 'failed';
  const running = call.status === 'running';
  const RowIcon = toolRowIcon(call.name);
  const spawns: readonly (SubagentSpawnView | null)[] =
    kind === 'subagent' && call.subagents.length > 0 ? call.subagents : [null];

  const rowContent = (spawn: SubagentSpawnView | null, last: boolean) => (
    <>
      <span
        className={cn(
          'shrink-0 text-[12.5px] leading-[20px] font-medium',
          running ? 'shimmer-text' : 'text-muted-foreground',
        )}
      >
        {toolRowLabelOf(call)}
      </span>
      {spawn === null ? (
        <span
          title={call.argsPreview}
          className={cn(
            // 单行不折行：超长由 toolSummary 按字符上限截断（截在词边界，
            // 尾字是「…」），CSS 的 truncate 只兜底极端窄窗。曾用 break-words
            // 让长命令折行，折行会把行尾箭头挤到第二行，破坏单行形态。
            'min-w-0 shrink truncate',
            toolPreviewMono(kind) ? 'font-mono text-[12.5px]' : 'text-[12.5px]',
            running ? 'shimmer-text' : failed ? 'text-diff-del' : 'text-muted-foreground',
          )}
        >
          {toolSummary(call.argsPreview)}
        </span>
      ) : (
        <>
          {spawn.agent.length > 0 ? (
            <span
              title={spawn.agent}
              className={cn(
                'max-w-[45%] shrink-0 truncate font-mono text-[12.5px] leading-[20px] font-medium',
                running ? 'shimmer-text' : 'text-link',
              )}
            >
              {spawn.agent}
            </span>
          ) : null}
          {spawn.task.length > 0 ? (
            <>
              {spawn.agent.length > 0 ? (
                <span aria-hidden="true" className="shrink-0 text-[12.5px] leading-[20px] text-muted-foreground/70">
                  ·
                </span>
              ) : null}
              <span
                title={spawn.task}
                className={cn(
                  'min-w-0 shrink truncate text-[12.5px] leading-[20px]',
                  running ? 'shimmer-text' : 'text-muted-foreground',
                )}
              >
                {spawn.task}
              </span>
            </>
          ) : (
            <span className="min-w-0" />
          )}
        </>
      )}
      {last ? callTail(call) : null}
      {/* 箭头紧跟文案：它是这行的展开开关，飘到行尾会与操作对象失联 */}
      {last && expandable ? <ChevronToggle open={open} className={chevronRevealClass(open)} /> : null}
    </>
  );

  return (
    <div className="group flex flex-col">
      {spawns.map((spawn, index) => {
        const last = index === spawns.length - 1;
        return (
          <div key={spawn === null ? call.id : `${call.id}-${index}`} className="flex items-center gap-[6px]">
            {index === 0 ? (
              <ProcessRailIcon>
                <RowIcon
                  // 图标不吃 shimmer：那是 background-clip:text 的文字扫光技法，
                  // 作用在 SVG 上会因 color:transparent + stroke=currentColor
                  // 让描边整个消失（运行中图标反而不见了）。运行态由文案承载。
                  className="size-[13px] shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-label={toolRowLabelOf(call)}
                />
              </ProcessRailIcon>
            ) : (
              <span aria-hidden="true" className="size-[13px] shrink-0" />
            )}
            {expandable ? (
              <button
                type="button"
                onClick={() => setPref(!open)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-[6px] rounded-md px-[2px] py-[1px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {rowContent(spawn, last)}
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-[6px] px-[2px] py-[1px]">{rowContent(spawn, last)}</div>
            )}
          </div>
        );
      })}
      {expandable && open ? <ToolCallDetail call={call} /> : null}
    </div>
  );
}

export { ToolCallRow };
