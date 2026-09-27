import * as React from 'react';

import { ToolCallRow } from './tool-call-row';
import { ToolGroupHeader } from './tool-group-header';
import { FileDiffSection } from './file-diff-section';
import { autoOpenForGroup } from './call-detail';
import type { ToolCallModel } from './thread-model';

type ToolGroupProps = {
  calls: readonly ToolCallModel[]
}

/**
 * 并行执行组（一条 assistant 消息内 LLM 一次返回的多个工具调用）：
 * 标题行聚合本批执行（可点开合），展开后是各调用行 + 文件级 diff 区。
 * 批次内有失败调用时标题行自动展开——错误必须看得见；手动意图优先于自动（与轮级同一裁决）。
 */
function ToolGroup({ calls }: ToolGroupProps) {
  const [pref, setPref] = React.useState<boolean | null>(null);
  const open = pref ?? autoOpenForGroup(calls);

  return (
    <div className="flex flex-col gap-[2px]">
      <ToolGroupHeader calls={calls} open={open} onToggle={() => setPref(!open)} />
      {open ? calls.map((call) => <ToolCallRow key={call.id} call={call} />) : null}
      {open ? <FileDiffSection calls={calls} /> : null}
    </div>
  );
}

const ToolGroupMemo = React.memo(ToolGroup);
export { ToolGroupMemo as ToolGroup };
