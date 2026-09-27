import { BookOpen, Pencil, SquareTerminal, Wrench, type LucideIcon } from 'lucide-react';

import { toolGroupIconKey, toolIconKey, type ToolIconKey } from '@paiapp/ui-thread';

/**
 * 图标语义键 → PC 图标组件：类别语义（哪类工具配哪支图标）在共享包
 * `@paiapp/ui-thread`，图标组件是平台件（移动端映射 lucide-react-native）。
 */
function iconOf(key: ToolIconKey): LucideIcon {
  if (key === 'pencil') return Pencil;
  if (key === 'book') return BookOpen;
  if (key === 'terminal') return SquareTerminal;
  return Wrench;
}

/** 单个执行单元（按工具名）→ 类别图标。 */
export function toolRowIcon(name: string): LucideIcon {
  return iconOf(toolIconKey(name));
}

/** 并行执行组的标题图标。 */
export function toolGroupIcon(calls: readonly { readonly name: string }[]): LucideIcon {
  return iconOf(toolGroupIconKey(calls));
}
