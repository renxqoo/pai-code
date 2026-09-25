import { ChevronDown, Shield } from 'lucide-react';

import { MenuButton, type MenuItemDef } from '@paiapp/ui';

import { copy } from '@/strings';
import { permModeLabel } from '@/strings/perm-mode-label';

import { menuTriggerClassName } from '@paiapp/ui';

type PermissionModeMenuProps = {
  /** 当前生效模式（permission/mode 读口；normalizePermMode 已收敛为词表值）。 */
  mode: string
  /** 选项面 = host 词表（读口响应的 modes 字段，随数据走——会话菜单取
   *  sessionPermissionMode.modes、新任务页取 hubSettings.permissionModes；非空由 verb 保证）。 */
  modes: readonly string[]
  onSelectMode: (mode: string) => void
}

/** 会话权限模式下拉：读 permission/mode、写 permission/setMode（下一工具裁决生效）。 */
function PermissionModeMenu({ mode, modes, onSelectMode }: PermissionModeMenuProps) {
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
