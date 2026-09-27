import * as React from 'react';

import { FileDiffRow } from './file-diff-row';
import { groupEditsByFile } from './edit-file-groups';
import type { ToolCallModel } from './thread-model';

type FileDiffSectionProps = {
  /** 批次内的调用（编辑类调用携带 editHunks；其余忽略） */
  calls: readonly ToolCallModel[]
}

/**
 * 文件级 diff 区（GitHub 形态：编辑一个文件 = 一个可展开的 diff）。
 *
 * 模型对同一文件常连续调用 edit，逐行展示会读成「改了两个文件」；这里按
 * path 归并后每个文件一行标题（文件名 + 展开箭头），展开是全部补丁堆叠。
 * 挂在过程行之后，与调用行同一灰度。
 */
function FileDiffSection({ calls }: FileDiffSectionProps) {
  const groups = groupEditsByFile(calls);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-[2px]">
      {groups.map((group, index) => (
        <FileDiffRow key={`${group.path}-${index}`} path={group.path} hunks={group.hunks} />
      ))}
    </div>
  );
}

export { FileDiffSection };
