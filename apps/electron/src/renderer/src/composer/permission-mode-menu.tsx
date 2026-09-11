import { ChevronDown, Shield } from 'lucide-react';

import type { PermissionRules } from '@paiapp/contracts';
import { MenuButton, type MenuItemDef } from '@paiapp/ui';

import { copy } from '@/strings';

import { menuTriggerClassName } from '@paiapp/ui';

type PermissionModeMenuProps = {
  /** 当前生效模式（sidecar 优先，否则全局）。 */
  mode: PermissionRules['mode']
  /** true = 生效规则来自全局文件（无会话 sidecar），「跟随全局」不可再点。 */
  followsGlobal: boolean
  onSelectMode: (mode: PermissionRules['mode']) => void
  onFollowGlobal: () => void
}

const MODES: readonly PermissionRules['mode'][] = ['ask', 'allow-all', 'block-all'];

/** 会话权限模式下拉：切换以当前生效规则为基线写 sidecar；「跟随全局」删 sidecar。 */
function PermissionModeMenu({ mode, followsGlobal, onSelectMode, onFollowGlobal }: PermissionModeMenuProps) {
  // 语言切换后随渲染重估（模块级常量会冻结首个 locale）
  const labels: Record<PermissionRules['mode'], string> = {
    ask: copy.settings.permissionsModeAsk,
    'allow-all': copy.settings.permissionsModeAllowAll,
    'block-all': copy.settings.permissionsModeBlockAll,
  };
  const items: MenuItemDef[] = [
    ...MODES.map((value) => ({ kind: 'item' as const, id: value, label: labels[value], selected: mode === value })),
    { kind: 'separator' },
    { kind: 'item', id: 'follow-global', label: copy.settings.permissionsFollowGlobalAction, disabled: followsGlobal },
  ];
  return (
    <MenuButton
      aria-label={copy.composer.permissionMode}
      align="start"
      items={items}
      onSelect={(id) => {
        if (id === 'follow-global') {
          onFollowGlobal();
          return;
        }
        if ((MODES as readonly string[]).includes(id)) onSelectMode(id as PermissionRules['mode']);
      }}
      triggerClassName={`${menuTriggerClassName} shrink-0`}
      trigger={
        <>
          <Shield size={13} className="text-muted-foreground" strokeWidth={2} />
          <span className="whitespace-nowrap">{labels[mode]}</span>
          <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
        </>
      }
    />
  );
}

export { PermissionModeMenu };
