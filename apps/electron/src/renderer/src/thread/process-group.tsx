import * as React from 'react';

import { ThinkingBlock } from './thinking-block';
import { ToolsBlock } from './tools-block';
import type { ProcessTurnBlock } from './process-runs';

type ProcessGroupProps = {
  blocks: readonly ProcessTurnBlock[]
  /** 仍在流式输出的思考块 id（null = 无）：思考单元的运行态是块粒度信号，
   * 长工具轮里早已定形的思考不再挂「思考中」。 */
  streamingThinkingBlockId: string | null
};

/**
 * 过程组：相邻思考/工具块共享的执行时间线容器。
 * 过程行与正文左对齐（不缩进），行首图标内联在文案前——执行过程是正文旁边的脚注，
 * 不是另一级内容；容器只负责把相邻过程行收拢成连续的一段。
 */
function ProcessGroup({ blocks, streamingThinkingBlockId }: ProcessGroupProps) {
  return (
    <div className="flex flex-col gap-[4px]">
      {blocks.map((block) =>
        block.kind === 'thinking' ? (
          <ThinkingBlock key={block.id} text={block.text} running={streamingThinkingBlockId === block.id} />
        ) : (
          <ToolsBlock key={block.id} calls={block.calls} />
        ),
      )}
    </div>
  );
}

const ProcessGroupMemo = React.memo(ProcessGroup);
export { ProcessGroupMemo as ProcessGroup };
