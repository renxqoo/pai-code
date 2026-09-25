import { formatDiffDelta } from '@paiapp/ui';
import type { DiffFileModel } from './thread-model';

type DiffFileListProps = {
  files: readonly DiffFileModel[]
  className?: string
  /** 点击行在文件查看 pane 打开该文件（不传 = 纯展示，如消息流卡片）。 */
  onOpenFile?: (path: string) => void
}

/**
 * Diff 文件明细：路径 + 单文件增删量，按传入顺序逐行排列。
 * 只负责行内容，容器内边距/滚动/边框由调用方决定（消息流卡片与侧栏面板共用同一份行样式）。
 */
function DiffFileList({ files, className, onOpenFile }: DiffFileListProps) {
  return (
    <ul className={className}>
      {files.map((file) => {
        const row = (
          <>
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={file.path}>
              {file.path}
            </span>
            <span className="shrink-0 tabular-nums text-diff-add">{formatDiffDelta('add', file.additions)}</span>
            <span className="shrink-0 tabular-nums text-diff-del">{formatDiffDelta('del', file.deletions)}</span>
          </>
        );
        return onOpenFile === undefined ? (
          <li key={file.path} className="flex h-[24px] items-center gap-[10px] font-mono text-[11px] leading-none">
            {row}
          </li>
        ) : (
          <li key={file.path} className="flex h-[24px] items-center gap-[10px] font-mono text-[11px] leading-none">
            <button
              type="button"
              onClick={() => onOpenFile(file.path)}
              title={file.path}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-[10px] rounded px-[4px] py-[2px] text-left outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {row}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export { DiffFileList }
