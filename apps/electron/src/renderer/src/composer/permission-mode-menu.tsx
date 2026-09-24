import { ChevronDown, Shield } from 'lucide-react';

import type { PermMode } from '@paiapp/contracts';
import { currentPermModes } from '@paiapp/contracts';
import { MenuButton, type MenuItemDef } from '@paiapp/ui';

import { copy } from '@/strings';

import { menuTriggerClassName } from '@paiapp/ui';

type PermissionModeMenuProps = {
  /** 当前生效模式（permission/mode 读口；normalizePermMode 已收敛为词表值）。 */
  mode: PermMode
  onSelectMode: (mode: PermMode) => void
}

/** 权限模式展示名（语言切换后随渲染重估——模块级常量会冻结首个 locale）。
 *  词表外档（host 协议扩展、文案未收录）回退 id 本身——新档可见可选，不崩。 */
export function permModeLabel(mode: PermMode): string {
  return copy.settings.permModeOptions[mode] ?? mode;
}

/** 会话权限模式下拉：读 permission/mode、写 permission/setMode（下一工具裁决生效）。
 *  选项面 = host 词表（permission/get_mode modes 收敛；host 缺席回落内置缺省）。 */
function PermissionModeMenu({ mode, onSelectMode }: PermissionModeMenuProps) {
  const modes = currentPermModes();
  const items: MenuItemDef[] = modes.map((value) => ({
    kind: 'item' as const,
    id: value,
    label: permModeLabel(value),
    selected: mode === value,
  }));
  return (
    <MenuButton
      aria-label={copy.composer.permissionMode}
      align="start"
      items={items}
      onSelect={(id) => {
        if (modes.includes(id)) onSelectMode(id);
      }}
      triggerClassName={`${menuTriggerClassName} shrink-0`}
      trigger={
        <>
          <Shield size={13} className="text-muted-foreground" strokeWidth={2} />
          <span className="whitespace-nowrap">{permModeLabel(mode)}</span>
          <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
        </>
      }
    />
  );
}

export { PermissionModeMenu };
