import { BookOpen, Pencil, SquareTerminal, Wrench, type LucideIcon } from 'lucide-react';

import { toolKindOf, type ToolKind } from './tool-kind';

/**
 * 执行单元的类别图标（组头与单条行共用一套语义）：
 * 文件改写（edit/write）→ 铅笔；阅读 → 书；命令 → 终端；其余（搜索/目录/子智能体/未知）
 * → 扳手。未知工具名不猜图标。类别语义优先于成败——失败的一组仍是「编辑」而不是红叉
 * （成败由行尾状态与详情承担）。
 */
const KIND_ICONS: Readonly<Partial<Record<ToolKind, LucideIcon>>> = {
  edit: Pencil,
  write: Pencil,
  read: BookOpen,
  bash: SquareTerminal,
};

/** 单个执行单元（按工具名）→ 类别图标。 */
export function toolRowIcon(name: string): LucideIcon {
  return KIND_ICONS[toolKindOf(name)] ?? Wrench;
}
