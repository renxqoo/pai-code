import { formatDiffDelta } from './format-count-unit';
import type { DiffFileModel } from './thread-model';

type DiffFileListProps = {
  files: readonly DiffFileModel[]
  className?: string
}

/**
 * Diff 文件明细：路径 + 单文件增删量，按传入顺序逐行排列。
 * 只负责行内容，容器内边距/滚动/边框由调用方决定（消息流卡片与侧栏面板共用同一份行样式）。
 */
function DiffFileList({ files, className }: DiffFileListProps) {
  return (
    <ul className={className}>
      {files.map((file) => (
        <li key={file.path} className="flex h-[24px] items-center gap-[10px] font-mono text-[11px] leading-none">
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={file.path}>
            {file.path}
          </span>
          <span className="shrink-0 tabular-nums text-diff-add">{formatDiffDelta('add', file.additions)}</span>
          <span className="shrink-0 tabular-nums text-diff-del">{formatDiffDelta('del', file.deletions)}</span>
        </li>
      ))}
    </ul>
  );
}

export { DiffFileList }
