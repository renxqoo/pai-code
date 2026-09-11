import * as React from 'react';
import { useStore } from 'zustand';

import { ComposerRegion } from '@/composer/composer-region';
import { DialogLayer } from '@/dialogs/dialog-layer';
import { NewTaskScreen } from '@/screens/new-task-screen';
import { useNewTaskPage } from '@/screens/use-new-task-page';
import { navigation } from '@/screens/workspace-navigation';
import { TitleBarLeft } from '@/layout/title-bar-left';
import { WindowCaptionButtons } from '@/layout/window-caption-buttons';
import { isWindowsPlatform } from '@/lib/platform';
import { useObservedHeight } from '@/hooks/use-observed-height';
import { useCmdHotkeys } from '@/hooks/cmd-hotkeys';
import { NoticeStrip } from '@/notices/notice-strip';
import { SettingsScreen } from '@/settings/settings-screen';
import { Sidebar } from '@/sidebar/sidebar';
import { useUsagePanel } from '@/hooks/use-usage-panel';
import { useSettingsScreen } from '@/settings/use-settings-screen';
import { StopConfirmBar } from '@/thread/stop-confirm-bar';
import { UsageScreen } from '@/screens/usage-screen';
import { useEscDismiss } from '@/screens/use-esc-dismiss';
import { hotkeyGating } from '@/screens/hotkey-gating';
import { ThreadBanner } from '@/thread/thread-banner';
import { PanelLayer } from '@/screens/panel-layer';
import { CommandPalette } from '@/palette/command-palette';
import { useCommandPalette } from '@/screens/use-command-palette';
import { ThreadStage } from '@/screens/thread-stage';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import { uiStore } from '@/ui/ui-store';

import { copy } from '@/strings';

/** ui store 动作引用恒定（zustand 动作创建即稳定），模块级取出，渲染期零重建。 */
const {
  openSidebarSearch,
  openSettings,
  openSettingsAt,
  closeSettings,
  toggleSidebarCollapsed,
  restoreDraft,
  setConfirmStop,
} = uiStore.getState();

/** 输入浮层高度通道（T34 U3）：测量回调模块级恒定引用写 ui store（+24 偏移在动作内），
 * 高度变化只重渲舞台订阅处——WorkspaceMain 仅读值喂 props（M2 起舞台自订，此订阅移除）。 */
const publishComposerInset = (height: number): void => {
  uiStore.getState().setComposerInset(height);
};

function WorkspaceMain({ workspace }: { workspace: LiveWorkspaceView }): React.JSX.Element {
  const sidebarCollapsed = useStore(uiStore, (s) => s.sidebarCollapsed);
  /** 项目文件面板（T18）：开合门控读（target null = 关闭，侧栏内容区照旧） */
  const projectFilesState = useStore(uiStore, (s) => s.projectFiles);
  /** 侧栏宽度：拖拽真相在 ui store（resize 装配在 Sidebar 壳内），标题栏避让消费 */
  const sidebarWidth = useStore(uiStore, (s) => s.sidebarWidth);
  /** 命令面板跳设置分区：进入分区经一次性 entry（关闭即清，普通打开不受影响）。 */
  const settingsOpen = useStore(uiStore, (s) => s.settingsOpen);
  const settingsEntry = useStore(uiStore, (s) => s.settingsEntry);
  /** 停止确认条开合（H2：不可恢复的停止先确认；Esc 链同源，真相在 ui store） */
  const confirmStop = useStore(uiStore, (s) => s.confirmStop);
  const composerLayerRef = useObservedHeight<HTMLDivElement>(publishComposerInset);
  /** Usage 总览页（I2；侧栏 footer 入口） */
  const usagePanel = useUsagePanel(workspace.sessions, workspace.statsById, workspace.actions.refreshAllStats);
  const { sessions, activeThreadId } = workspace;

  const usageOpen = usagePanel.usageOpen;
  const closeUsage = usagePanel.closeUsage;
  /** 界面语言与全部设置页数据/动作经 use-settings-screen 装配（语言广播后 app 根重挂载） */
  const settings = useSettingsScreen({ workspace, open: settingsOpen, onClose: closeSettings, initialSection: settingsEntry ?? undefined });
  /** 设置分区一次性 entry：开沿消费即清——不随 ui store 跨语言重挂载存活（基线：重挂载停首分区）。 */
  const wasSettingsOpen = React.useRef(false);
  React.useEffect(() => {
    if (settingsOpen && !wasSettingsOpen.current) uiStore.setState({ settingsEntry: null });
    wasSettingsOpen.current = settingsOpen;
  }, [settingsOpen]);
  /** 新建任务页：生命周期与渲染属性装配（退出出口集中在该 hook 的 close） */
  const newTask = useNewTaskPage({ workspace, onOpenSettings: openSettings, onDraftRestore: restoreDraft });
  const openNewTask = React.useCallback(() => newTask.enter(''), [newTask.enter]);

  /** 命令面板（⌘P）装配：开关/条目/派发（hub 对话框模态期间不唤起）。 */
  const commandPalette = useCommandPalette({
    workspace,
    activeThreadId,
    sessions,
    openNewTask,
    openSettings,
    openSettingsAt,
    openUsage: usagePanel.openUsage,
    navigateSession: navigation.onSelectSession,
  });
  const { open: paletteOpen, close: closePalette, toggle: togglePalette, items: paletteItems, onSelect: onPaletteSelect } = commandPalette;
  /** 面板 props 引用恒定：CommandPalette 是 memo 边界，内联箭头/对象会被流式批推击穿并重置文件搜索去抖（T30 审查 高-2）。 */
  const paletteCwd = workspace.activeCwd;
  const searchFilesIn = workspace.actions.searchFilesIn;
  const paletteFileSearch = React.useCallback((query: string) => searchFilesIn(paletteCwd, query), [searchFilesIn, paletteCwd]);
  const paletteLabels = React.useMemo(
    () => ({ aria: copy.palette.aria, placeholder: copy.palette.placeholder, empty: copy.palette.empty, groups: copy.palette.groups }),
    [],
  );

  /** ⌘N/⌘K/⌘P 门控矩阵单一真相在 hotkey-gating 纯函数（表驱动用例钉住）。 */
  const { hotkeysEnabled, paletteHotkeyEnabled } = hotkeyGating({
    dialogCount: workspace.dialogs.length,
    paletteOpen,
    newTaskOpen: newTask.open,
    usageOpen,
    settingsOpen,
    projectFilesOpen: projectFilesState.target !== null,
  });
  useCmdHotkeys(
    {
      onNewThread: openNewTask,
      onSearch: openSidebarSearch,
      onToggleDiff: () => uiStore.getState().toggleDiffPane(),
      onToggleAgents: () => uiStore.getState().toggleAgentsPane(),
      onPalette: togglePalette,
    },
    hotkeysEnabled,
    paletteHotkeyEnabled,
  );

  useEscDismiss({
    /** 本地浮层也算对话框：浮层自行消费 Esc，全局链不穿透关闭整页 */
    dialogCount: workspace.dialogs.length + (newTask.dialogOpen ? 1 : 0),
    paletteOpen,
    onPaletteClose: closePalette,
    panelOpen: useStore(uiStore, (s) => s.panel.activeId !== null),
    onPanelClose: () => uiStore.getState().closePanel(),
    bashRunning: workspace.bashRunning,
    generating: workspace.generating,
    agentsActive: workspace.agentsActive,
    abortBash: workspace.actions.abortBash,
    stopActiveTurn: workspace.actions.stopActiveTurn,
  });

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {newTask.screen === null ? (
          <>
            <ThreadStage />
            <div ref={composerLayerRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-[40px] pb-[18px]">
          {confirmStop ? (
            <StopConfirmBar
              onConfirm={() => {
                setConfirmStop(false);
                workspace.actions.stopActiveTurn();
              }}
              onCancel={() => setConfirmStop(false)}
            />
          ) : null}
          <ThreadBanner />
          <ComposerRegion />
            </div>
          </>
        ) : (
          <NewTaskScreen key={newTask.screen.key} {...newTask.screen.props} />
        )}
      </div>
      {usageOpen ? <UsageScreen entries={usagePanel.entries} onClose={closeUsage} /> : null}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        items={paletteItems}
        searchFiles={paletteFileSearch}
        labels={paletteLabels}
        onSelect={onPaletteSelect}
      />
      <PanelLayer />
      <TitleBarLeft
        titleName={copy.appTitle.name}
        titleSuffix={copy.appTitle.suffix}
        toggleLabel={sidebarCollapsed ? copy.sidebar.expandSidebarHint : copy.sidebar.collapseSidebarHint}
        collapsed={sidebarCollapsed}
        sidebarWidth={sidebarWidth}
        onToggle={toggleSidebarCollapsed}
      />
      {isWindowsPlatform ? <WindowCaptionButtons /> : null}
      <SettingsScreen
        {...settings}
        history={{
          ...settings.history,
          // 打开历史会话 = 导航到会话：与侧栏行走同一出口（退出新建任务页 + 关设置页）
          onOpenSaved: navigation.onOpenSavedSession,
        }}
      />
      <NoticeStrip notices={workspace.notices} onDismiss={workspace.actions.dismissNotice} />
      <DialogLayer
        dialogs={workspace.dialogs}
        onRespond={workspace.actions.respondDialog}
        onCancel={workspace.actions.cancelDialog}
      />
    </div>
  );
}

export { WorkspaceMain };
