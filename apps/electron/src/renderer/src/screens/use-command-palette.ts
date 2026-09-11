import * as React from 'react';
import { useStore } from 'zustand';

import { insertIntoDraft } from '@/composer/composer-controller';
import { uiStore } from '@/ui/ui-store';
import type { SettingsSectionId } from '@/settings/settings-sections';
import { openFileTab } from '@/panel/panel-controller';
import { actionItems, commandItems, sessionItems, settingsItems, type PaletteItem } from '@/palette/palette-items';
import { sessionCardsOf } from '@/sidebar/session-cards';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { copy } from '@/strings';
import { MODIFIER_KEY_LABEL } from '@/lib/platform';

/**
 * 命令面板（⌘P）装配面（T34 M3：漏斗退役——条目与派发自订阅 store + 单例）：
 * 开关是本地低频态；静态条目（动作/会话/命令/设置）在条目侧 hook（items 归
 * CommandPalette 组件内消费，不进工作区订阅面）。id 词表封闭（palette-items）；
 * 文件组由 CommandPalette 按输入词动态搜索。
 */

export function usePaletteItems(active: boolean): readonly PaletteItem[] {
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  const activeCwd = useStore(liveStore, (s) => (s.activeThreadId === null ? '' : s.sessions[s.activeThreadId]?.cwd ?? ''));
  const sessionViews = useStore(liveStore, (s) => s.sessions);
  const commands = useStore(liveStore, (s) => s.commands);
  void active; // 订阅常驻（open 门控在渲染层早退），条目引用稳定不驱动外层
  return React.useMemo<readonly PaletteItem[]>(() => {
    const hasSession = activeThreadId.length > 0;
    return [
      ...actionItems(copy.palette.actions, { hasSession, hasCwd: activeCwd.length > 0, modifier: MODIFIER_KEY_LABEL }),
      ...sessionItems(sessionCardsOf(sessionViews)),
      ...commandItems(commands),
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
  }, [activeThreadId, activeCwd, sessionViews, commands]);
}

type UseCommandPaletteArgs = {
  openNewTask: () => void
  openSettings: () => void
  openSettingsAt: (section: SettingsSectionId) => void
  openUsage: () => void
  /** 会话跳转出口（退出新建任务页/设置页等覆盖层的同一导航链）。 */
  navigateSession: (threadId: string) => void
}

type CommandPaletteApi = {
  open: boolean
  close: () => void
  toggle: () => void
  onSelect: (id: string) => void
}

export function useCommandPalette(args: UseCommandPaletteArgs): CommandPaletteApi {
  const { openNewTask, openSettings, openSettingsAt, openUsage, navigateSession } = args;
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  const activeCwd = useStore(liveStore, (s) => (s.activeThreadId === null ? '' : s.sessions[s.activeThreadId]?.cwd ?? ''));

  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => setOpen((current) => !current), []);

  const onSelect = React.useCallback(
    (id: string) => {
      if (id === 'action:newTask') openNewTask();
      else if (id === 'action:openDiff') uiStore.getState().openDiffPane();
      else if (id === 'action:openAgents') uiStore.getState().openAgentsPane();
      else if (id === 'action:openFinder') void workspaceActions.openInSystem(activeCwd, 'finder');
      else if (id === 'action:openTerminal') void workspaceActions.openInSystem(activeCwd, 'terminal');
      else if (id === 'action:openEditor') void workspaceActions.openInSystem(activeCwd, 'editor');
      else if (id === 'action:copyPath') void workspaceActions.copyText(activeCwd);
      else if (id === 'action:copySessionId') void workspaceActions.copyText(activeThreadId);
      else if (id === 'action:closeSession') workspaceActions.closeSession(activeThreadId);
      else if (id === 'action:openSettings') openSettings();
      else if (id === 'action:openUsage') openUsage();
      else if (id.startsWith('session:')) navigateSession(id.slice('session:'.length));
      else if (id.startsWith('file:')) openFileTab(id.slice('file:'.length));
      else if (id.startsWith('command:')) {
        // 斜杠命令填入 composer（词法/执行语义统一留在输入框侧；通道=controller 追加+聚焦）
        insertIntoDraft(`/${id.slice('command:'.length)} `);
      } else if (id.startsWith('settings:')) openSettingsAt(id.slice('settings:'.length) as SettingsSectionId);
    },
    [activeThreadId, activeCwd, openNewTask, openSettings, openUsage, navigateSession, openSettingsAt],
  );

  return { open, close, toggle, onSelect };
}
