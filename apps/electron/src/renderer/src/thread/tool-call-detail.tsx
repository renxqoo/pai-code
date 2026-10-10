import * as React from 'react';

import { FileContentPanel } from './file-content-panel';
import { OutputPanel } from './output-panel';
import { toolKindOf } from '@x3code/ui-thread';
import type { ToolCallModel } from './thread-model';

type ToolCallDetailProps = {
  call: ToolCallModel
};

/**
 * 工具单元详情按种类分派：read 看文件内容（行号 + 内容），其余走通用输出面板。
 * edit 的补丁不在这里——同一文件的多次编辑由批次级的 FileDiffSection 按 path
 * 归并成一个 diff（GitHub 形态）；逐行展示会读成「改了好几个文件」。
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
  if (!hasOutput) return null;
  return (
    <div className="mt-[2px] flex flex-col gap-[6px]">
      <OutputPanel call={call} />
    </div>
  );
}

export { ToolCallDetail };
