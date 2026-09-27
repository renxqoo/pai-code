import { Wrench, type LucideIcon } from 'lucide-react';

import { toolGroupBuckets } from './tool-group-summary';
import { toolRowIcon } from './tool-row-icon';
import type { ToolCallModel } from './thread-model';

/**
 * 并行执行组的标题图标：单一类别桶取该桶图标（edit/write 同属文件改写 → 同一支铅笔），
 * 多类别混合落扳手——「这批工具干了什么」比「这批工具是谁」更值得占图标位。
 */
export function toolGroupIcon(calls: readonly ToolCallModel[]): LucideIcon {
  const buckets = toolGroupBuckets(calls);
  if (buckets.length !== 1) return Wrench;
  return toolRowIcon(buckets[0]?.kind ?? 'other');
}
