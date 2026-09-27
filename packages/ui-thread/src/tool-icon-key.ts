import { toolKindOf, type ToolKind } from './tool-kind';
import { toolGroupBuckets } from './tool-group-summary';
import type { ToolNameRef } from './tool-refs';

/**
 * 类别图标语义（组头与单条行共用一套）：哪类工具配哪支图标是纯语义，
 * 图标组件本身（lucide-react / lucide-react-native）是平台件，由各端映射。
 * 文件改写（edit/write）→ 铅笔；阅读 → 书；命令 → 终端；其余（搜索/目录/
 * 子智能体/未知）→ 扳手。未知工具名不猜图标。类别语义优先于成败——失败的
 * 一组仍是「编辑」而不是红叉（成败由行尾状态与详情承担）。
 */
export type ToolIconKey = 'pencil' | 'book' | 'terminal' | 'wrench';

const ICON_KEY_BY_KIND: Readonly<Record<ToolKind, ToolIconKey>> = {
  bash: 'terminal',
  read: 'book',
  edit: 'pencil',
  write: 'pencil',
  search: 'wrench',
  list: 'wrench',
  subagent: 'wrench',
  other: 'wrench',
};

/** 单个执行单元（按工具名）→ 图标语义键。 */
export function toolIconKey(name: string): ToolIconKey {
  return ICON_KEY_BY_KIND[toolKindOf(name)];
}

/**
 * 并行执行组 → 图标语义键：单一类别桶取该桶图标（edit/write 同属文件改写 → 同一支铅笔），
 * 多类别混合落扳手——「这批工具干了什么」比「这批工具是谁」更值得占图标位。
 */
export function toolGroupIconKey(calls: readonly ToolNameRef[]): ToolIconKey {
  const buckets = toolGroupBuckets(calls);
  const only = buckets.length === 1 ? buckets[0] : undefined;
  return only === undefined ? 'wrench' : ICON_KEY_BY_KIND[only.kind];
}
