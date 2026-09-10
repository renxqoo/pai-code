import { BookOpen, Bot, Check, FilePlus, FolderOpen, Minus, PenLine, Search, Terminal, Wrench, X, type LucideIcon } from 'lucide-react';

import { copy } from '@/strings';
import type { ToolCallStatus } from './thread-model';
import type { ToolKind } from './tool-kind';

type ToolStatusIconProps = {
  status: ToolCallStatus
  /** 工具类型：运行中以类型图标呈现（加载态由行内文字波纹承担） */
  kind?: ToolKind
};

/** 运行中的类型图标：与完成/失败状态图标同规格（12px 线性、中性色）。 */
const RUNNING_KIND_ICONS: Record<ToolKind, LucideIcon> = {
  bash: Terminal,
  read: BookOpen,
  edit: PenLine,
  write: FilePlus,
  search: Search,
  list: FolderOpen,
  subagent: Bot,
  other: Wrench,
};

/** 执行单元状态图标：运行中显类型图标（中性灰），成功绿、失败红、停止灰；颜色全走主题 token。 */
function ToolStatusIcon({ status, kind }: ToolStatusIconProps) {
  if (status === 'running') {
    const Icon = RUNNING_KIND_ICONS[kind ?? 'other'];
    return (
      <span role="status" aria-label={copy.flow.toolRunning} title={copy.flow.toolRunning} className="flex size-3 shrink-0 items-center justify-center">
        <Icon className="size-3 shrink-0 text-muted-foreground" strokeWidth={2} />
      </span>
    );
  }
  if (status === 'ok') {
    return <Check aria-hidden="true" className="size-3 shrink-0 text-dot-done" strokeWidth={2.25} />;
  }
  if (status === 'failed') {
    return <X aria-hidden="true" className="size-3 shrink-0 text-diff-del" strokeWidth={2.25} />;
  }
  return <Minus aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/60" strokeWidth={2} />;
}

export { ToolStatusIcon };
