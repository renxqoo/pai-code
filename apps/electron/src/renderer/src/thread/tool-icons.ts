import { BookOpen, Pencil, SquareTerminal, Wrench, type LucideIcon } from 'lucide-react';

import { toolGroupIconKey, toolIconKey, type ToolIconKey } from '@paiapp/ui-thread';

/**
 * 图标语义键 → PC 图标组件：类别语义（哪类工具配哪支图标）在共享包
 * `@paiapp/ui-thread`，图标组件是平台件（移动端映射 lucide-react-native）。
 */
const ICONS: Readonly<Record<ToolIconKey, LucideIcon>> = {
  pencil: Pencil,
  book: BookOpen,
  terminal: SquareTerminal,
  wrench: Wrench,
};

/** 单个执行单元（按工具名）→ 类别图标。 */
export function toolRowIcon(name: string): LucideIcon {
  return ICONS[toolIconKey(name)] ?? Wrench;
}

/** 并行执行组的标题图标。 */
export function toolGroupIcon(calls: readonly { readonly name: string }[]): LucideIcon {
  return ICONS[toolGroupIconKey(calls)] ?? Wrench;
}
