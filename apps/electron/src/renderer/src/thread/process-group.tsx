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
 * 左侧 2px 竖轨贯穿整组，各单元的状态图标骑在轨上（背景遮罩），
 * 让执行过程与正文消息在层级上一眼可分。
 */
function ProcessGroup({ blocks, streamingThinkingBlockId }: ProcessGroupProps) {
  return (
    <div className="relative flex flex-col pl-[26px]">
      <span aria-hidden="true" className="absolute top-[10px] bottom-[10px] left-[12px] w-[2px] rounded-full bg-border" />
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
