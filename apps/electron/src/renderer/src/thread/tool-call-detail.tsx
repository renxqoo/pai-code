import * as React from 'react';

import { EditHunkList } from './edit-hunk-list';
import { FileContentPanel } from './file-content-panel';
import { OutputPanel } from './output-panel';
import { toolKindOf } from './tool-kind';
import type { ToolCallModel } from './thread-model';

type ToolCallDetailProps = {
  call: ToolCallModel
};

/**
 * 工具单元详情按种类分派：read 看文件内容（行号 + 内容），edit 看补丁片段
 * （改了哪几行，不是整个文件），其余走通用输出面板。
 * 编辑类片段在前、输出在后（write 无基线可比，只剩输出面板）。
 */
function ToolCallDetail({ call }: ToolCallDetailProps) {
  const hasOutput = call.output.length > 0;
  if (toolKindOf(call.name) === 'read' && hasOutput) {
    return (
      <div className="mt-[2px] flex flex-col gap-[6px]">
        <FileContentPanel call={call} />
      </div>
    );
  }
  return (
    <div className="mt-[2px] flex flex-col gap-[6px]">
      {call.editHunks.length > 0 ? <EditHunkList hunks={call.editHunks} /> : null}
      {hasOutput ? <OutputPanel call={call} /> : null}
    </div>
  );
}

export { ToolCallDetail };
