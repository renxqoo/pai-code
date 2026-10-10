import * as React from 'react';

import { FileDiffRow } from './file-diff-row';
import { groupEditsByFile } from '@x3code/ui-thread';
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
 *
 * **只收成功调用的补丁**：片段派生自工具入参（`tool/call` 一到就有了），
 * 与执行结果无关。不按 status 过滤的话，运行中会同时出现「正在编辑 src/a.ts」
 * （行前缀）与「已编辑 a.ts」（diff 行），失败时更会挂一份看起来改成功了的
 * diff——这里展示的必须是「已改成的」，不是「想改的」。
 */
function FileDiffSection({ calls }: FileDiffSectionProps) {
  const groups = groupEditsByFile(calls.filter((call) => call.status === 'ok'));
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
