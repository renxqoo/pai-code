import { ChevronDown, Shield } from 'lucide-react';

import type { PermMode } from '@paiapp/contracts';
import { PERM_MODES } from '@paiapp/contracts';
import { MenuButton, type MenuItemDef } from '@paiapp/ui';

import { copy } from '@/strings';

import { menuTriggerClassName } from '@paiapp/ui';

type PermissionModeMenuProps = {
  /** 当前生效模式（permission/mode 读口；normalizePermMode 已收敛为词表值）。 */
  mode: PermMode
  onSelectMode: (mode: PermMode) => void
}

/** 权限模式展示名（语言切换后随渲染重估——模块级常量会冻结首个 locale）。 */
export function permModeLabel(mode: PermMode): string {
  return copy.settings.permModeOptions[mode];
}

/** 会话权限模式下拉：读 permission/mode、写 permission/setMode（四档；下一工具裁决生效）。 */
function PermissionModeMenu({ mode, onSelectMode }: PermissionModeMenuProps) {
  const items: MenuItemDef[] = PERM_MODES.map((value) => ({
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
        if ((PERM_MODES as readonly string[]).includes(id)) onSelectMode(id as PermMode);
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
