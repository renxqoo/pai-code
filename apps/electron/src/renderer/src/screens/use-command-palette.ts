import * as React from 'react';

import { insertIntoDraft } from '@/composer/composer-controller';
import { uiStore } from '@/ui/ui-store';
import type { SettingsSectionId } from '@/settings/settings-sections';
import type { SessionCardModel } from '@/sidebar/session-card-model';
import { openFileTab } from '@/panel/panel-controller';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import { actionItems, commandItems, sessionItems, settingsItems, type PaletteItem } from '@/palette/palette-items';
import { copy } from '@/strings';
import { MODIFIER_KEY_LABEL } from '@/lib/platform';

/**
 * 命令面板（⌘P）装配面：开关状态 + 静态条目（动作/会话/命令/设置）+ 选中派发。
 * id 词表封闭（palette-items）；文件组由 CommandPalette 按输入词动态搜索。
 */

type CommandPaletteApi = {
  open: boolean
  close: () => void
  toggle: () => void
  items: readonly PaletteItem[]
  onSelect: (id: string) => void
}

type UseCommandPaletteArgs = {
  workspace: LiveWorkspaceView
  activeThreadId: string
  sessions: readonly SessionCardModel[]
  openNewTask: () => void
  openSettings: () => void
  openSettingsAt: (section: SettingsSectionId) => void
  openUsage: () => void
  /** 会话跳转出口（退出新建任务页/设置页等覆盖层的同一导航链）。 */
  navigateSession: (threadId: string) => void
}

export function useCommandPalette(args: UseCommandPaletteArgs): CommandPaletteApi {
  const { workspace, activeThreadId, sessions, openNewTask, openSettings, openSettingsAt, openUsage, navigateSession } = args;

  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => setOpen((current) => !current), []);

  const items = React.useMemo<readonly PaletteItem[]>(() => {
    const hasSession = activeThreadId.length > 0;
    return [
      ...actionItems(copy.palette.actions, { hasSession, hasCwd: workspace.activeCwd.length > 0, modifier: MODIFIER_KEY_LABEL }),
      ...sessionItems(sessions),
      ...commandItems(workspace.commands),
      ...settingsItems({
        general: copy.settings.generalTitle,
        providers: copy.settings.providersTitle,
        permissions: copy.settings.permissionsTitle,
        agents: copy.settings.agentsTitle,
        skills: copy.settings.skillsTitle,
        history: copy.settings.historyTitle,
        runtime: copy.settings.runtimeTitle,
      }),
    ];
  }, [activeThreadId, workspace.activeCwd, workspace.commands, sessions]);

  const onSelect = React.useCallback(
    (id: string) => {
      if (id === 'action:newTask') openNewTask();
      else if (id === 'action:openDiff') uiStore.getState().openDiffPane();
      else if (id === 'action:openAgents') uiStore.getState().openAgentsPane();
      else if (id === 'action:openFinder') void workspace.actions.openInSystem(workspace.activeCwd, 'finder');
      else if (id === 'action:openTerminal') void workspace.actions.openInSystem(workspace.activeCwd, 'terminal');
      else if (id === 'action:openEditor') void workspace.actions.openInSystem(workspace.activeCwd, 'editor');
      else if (id === 'action:copyPath') void workspace.actions.copyText(workspace.activeCwd);
      else if (id === 'action:copySessionId') void workspace.actions.copyText(activeThreadId);
      else if (id === 'action:closeSession') workspace.actions.closeSession(activeThreadId);
      else if (id === 'action:openSettings') openSettings();
      else if (id === 'action:openUsage') openUsage();
      else if (id.startsWith('session:')) navigateSession(id.slice('session:'.length));
      else if (id.startsWith('file:')) openFileTab(id.slice('file:'.length));
      else if (id.startsWith('command:')) {
        // 斜杠命令填入 composer（词法/执行语义统一留在输入框侧；通道=controller 追加+聚焦）
        insertIntoDraft(`/${id.slice('command:'.length)} `);
      } else if (id.startsWith('settings:')) openSettingsAt(id.slice('settings:'.length) as SettingsSectionId);
    },
    [activeThreadId, workspace.activeCwd, workspace.actions, openNewTask, openSettings, openUsage, navigateSession, openSettingsAt],
  );

  return { open, close, toggle, items, onSelect };
}
