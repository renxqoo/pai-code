import type { MenuItemDef } from '@paiapp/ui';

/**
 * 顶栏两组菜单的词条装配（纯函数）：项目菜单 = 本机打开四动作；
 * 会话菜单 = 会话级操作（生成中隐藏受信重开——重开链需先停轮）。
 * id 词表封闭，消费方（thread-stage）按 id 派发动作。
 */

export type ProjectMenuLabels = {
  /** 三项目录动作文案（strings 表以 as const 元组保证恰好三项）。 */
  openMenu: readonly [string, string, string];
  copyPath: string;
};

export function projectMenuItems(labels: ProjectMenuLabels): readonly MenuItemDef[] {
  return [
    { kind: 'item', id: 'finder', label: labels.openMenu[0] },
    { kind: 'item', id: 'terminal', label: labels.openMenu[1] },
    { kind: 'item', id: 'editor', label: labels.openMenu[2] },
    { kind: 'separator' },
    { kind: 'item', id: 'copyPath', label: labels.copyPath },
  ];
}

export type SessionMenuLabels = {
  rename: string;
  copyId: string;
  reloadTrusted: string;
  reloadUntrusted: string;
  close: string;
};

export function sessionMenuItems(labels: SessionMenuLabels, generating: boolean): readonly MenuItemDef[] {
  const reloadItems: MenuItemDef[] =
    generating
      ? []
      : [
          { kind: 'separator' },
          { kind: 'item', id: 'reloadTrusted', label: labels.reloadTrusted },
          { kind: 'item', id: 'reloadUntrusted', label: labels.reloadUntrusted },
        ];
  return [
    { kind: 'item', id: 'rename', label: labels.rename },
    { kind: 'item', id: 'copyId', label: labels.copyId },
    ...reloadItems,
    { kind: 'separator' },
    { kind: 'item', id: 'close', label: labels.close },
  ];
}
