import { isKnownPermMode } from '@paiapp/contracts';

import { copy } from './index';

/** 权限模式展示名（语言切换后随渲染重估——每次调用按当前 locale 解析）：
 *  已知档查双语词表（Record<KnownPermMode, string> 键齐备）；词表外档（host 扩档、
 *  文案未收录）回退 id 本身——新档可见可选，不崩。 */
export function permModeLabel(mode: string): string {
  return isKnownPermMode(mode) ? copy.settings.permModeOptions[mode] : mode;
}
