import * as React from 'react';

import { ToolCallRow } from './tool-call-row';
import { ToolGroupHeader } from './tool-group-header';
import { FileDiffSection } from './file-diff-section';
import { autoOpenForGroup } from '@paiapp/ui-thread';
import type { ToolCallModel } from './thread-model';

type ToolGroupProps = {
  calls: readonly ToolCallModel[]
}

/**
 * 并行执行组（一条 assistant 消息内 LLM 一次返回的多个工具调用）：
 * 标题行聚合本批执行（可点开合），展开后是各调用行 + 文件级 diff 区。
 * 自动开合与调用级同一裁决：只有失败自动展开（错误必须看得见）；
 * 运行中/正常完成都收起为标题摘要——自动开合只认终态，开合对即闪现源；
 * 手动意图优先于自动并跨终态保持。
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
