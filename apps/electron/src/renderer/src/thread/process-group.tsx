import * as React from 'react';

import { ChevronToggle } from '@paiapp/ui';
import { toolGroupSummary } from '@paiapp/ui-thread';

import { toolCopy } from '@/strings/tool-copy';
import { cn } from '@/lib/utils';
import { autoOpenForProcessGroup } from './process-group-state';
import { ThinkingBlock } from './thinking-block';
import { ToolsBlock } from './tools-block';
import { chevronRevealClass, resolveOpen, type CollapsePref } from './collapse-state';
import type { ProcessTurnBlock, TurnRun } from './process-runs';

/** 展开区限高（≈12 行）：超过就滚动。
 *  原先的 `min(100px, 28vh)` 在窗口最小高度 560 下 vh 项只有 157px，从未真正生效
 *  （100px 恒小于它），是条失效的护栏——改为纯像素值，含义与实际渲染一致。 */
const EXPANDED_MAX_PX = 248;

type ProcessGroupProps = {
  run: TurnRun
  /** 仍在流式输出的思考块 id（null = 无） */
  streamingThinkingBlockId: string | null
  /** 本轮有子代理在跑（进度无别处可看） */
  subagentBusy: boolean
}

/**
 * 过程组：相邻思考/工具块共享的执行时间线容器，整组自带开合。
 *
 * **默认收起**（中间过程与末尾最终过程都是「铺垫/细节」，正文才是主角），
 * 例外是别处看不到的进度：在途调用、子代理在跑 → 自动展开。
 * 展开区限高滚动，运行中贴底跟随（用户上翻即让位）。
 *
 * 标题走计数式（「编辑 3 个文件, 思考 2 次, 执行 1 条命令」）——
 * 收起时那一行是这组唯一的入口，计数必须让用户一眼看出规模。
 * 思考只计标题、不进子行（展开后列工具调用，思考正文从标题进）。
 */
function ProcessGroup({ run, streamingThinkingBlockId, subagentBusy }: ProcessGroupProps) {
  const [pref, setPref] = React.useState<CollapsePref>(null);
  const blocks = run.kind === 'process' ? (run.blocks as readonly ProcessTurnBlock[]) : [];
  const open = resolveOpen(pref, autoOpenForProcessGroup({ run, subagentBusy }));

  const calls = blocks.flatMap((block) => (block.kind === 'tools' ? block.calls : []));
  const thinkingCount = blocks.filter((block) => block.kind === 'thinking').length;
  const title = toolGroupSummary({ calls, thinkingCount }, toolCopy());
  const failed = calls.some((call) => call.status === 'failed');

  return (
    <div className="group flex flex-col gap-[4px]">
      {title.length > 0 ? (
        <button
          type="button"
          onClick={() => setPref(!open)}
          aria-expanded={open}
          className="flex min-w-0 cursor-pointer items-center gap-[6px] rounded-md px-[2px] py-[1px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className={cn('min-w-0 truncate text-[12.5px] leading-[20px] font-medium', failed ? 'text-diff-del' : 'text-muted-foreground')}>
            {title}
          </span>
          <ChevronToggle open={open} className={chevronRevealClass(open)} />
        </button>
      ) : null}
      {open ? (
        <div
          className="scroll-thin flex flex-col gap-[4px] overflow-y-auto"
          style={{ maxHeight: EXPANDED_MAX_PX }}
        >
          {blocks.map((block) =>
            block.kind === 'thinking' ? (
              <ThinkingBlock key={block.id} text={block.text} running={streamingThinkingBlockId === block.id} />
            ) : (
              <ToolsBlock key={block.id} calls={block.calls} insideProcessGroup />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

const ProcessGroupMemo = React.memo(ProcessGroup);
export { ProcessGroupMemo as ProcessGroup };
