import * as React from 'react';

import { ToolCallRow } from './tool-call-row';
import { ToolGroup } from './tool-group';
import { FileDiffSection } from './file-diff-section';
import { toolGroupIsParallel } from '@paiapp/ui-thread';
import type { ToolCallModel } from './thread-model';

type ToolsBlockProps = {
  calls: readonly ToolCallModel[]
  /** 过程组内渲染：组头与摘要已由 `ProcessGroup` 承担，此处只铺行。
   *  不置位会套上消息级 `ToolGroup`——双层折叠头（计数式 + 动宾流水并存），
   *  且内层默认只认失败自动展开，在途调用的行会被挡在里面看不见。 */
  insideProcessGroup?: boolean
};

/** 工具块：一次 assistant 消息的调用集合 = 一个并行批次。批次内 ≥2 个调用套可开合组头
 * 聚合展示，单调用直接一个执行单元行（无并行可言，不套壳）。两条路径都挂文件级 diff 区
 * （同一文件的多次编辑合成一个 diff）。容器（缩进）由过程组提供。 */
function ToolsBlock({ calls, insideProcessGroup = false }: ToolsBlockProps) {
  if (calls.length === 0) return null;
  if (insideProcessGroup || !toolGroupIsParallel(calls)) {
    return (
      <div className="flex flex-col gap-[2px]">
        {calls.map((item) => (
          <ToolCallRow key={item.id} call={item} />
        ))}
        <FileDiffSection calls={calls} />
      </div>
    );
  }
  return <ToolGroup calls={calls} />;
}

const ToolsBlockMemo = React.memo(ToolsBlock);
export { ToolsBlockMemo as ToolsBlock };
