import * as React from 'react';

import { ToolCallRow } from './tool-call-row';
import type { ToolCallModel } from './thread-model';

type ToolsBlockProps = {
  calls: readonly ToolCallModel[]
};

/** 工具块：不自带头部，每次调用是一个执行单元行；容器（竖轨/缩进）由过程组提供。 */
function ToolsBlock({ calls }: ToolsBlockProps) {
  if (calls.length === 0) return null;
  return (
    <div className="flex flex-col">
      {calls.map((call) => (
        <ToolCallRow key={call.id} call={call} />
      ))}
    </div>
  );
}

const ToolsBlockMemo = React.memo(ToolsBlock);
export { ToolsBlockMemo as ToolsBlock };
