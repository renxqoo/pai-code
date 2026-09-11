import * as React from 'react';
import { useStore } from 'zustand';

import type { PermissionRules } from '@paiapp/contracts';

import { Composer } from '@/composer/composer';
import {
  editQueuedDraft,
  registerComposerTextarea,
  unregisterComposerTextarea,
} from '@/composer/composer-controller';
import { stopOrAbort } from '@/composer/stop-or-abort';
import { submitComposerDraft } from '@/composer/submit-composer-draft';
import { editUserMessage, forkUserMessage } from '@/screens/workspace-fork';
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
import { queuedDrafts } from '@/composer/queued-drafts';
import { branchSegmentOf } from '@/composer/branch-segment';
import { useGitBranches } from '@/hooks/use-git-branches';
import { useUsagePanel } from '@/hooks/use-usage-panel';
import { useSettingsScreen } from '@/settings/use-settings-screen';
import { StopConfirmBar } from '@/thread/stop-confirm-bar';
import { UsageScreen } from '@/screens/usage-screen';
import { useEscDismiss } from '@/screens/use-esc-dismiss';
import { hotkeyGating } from '@/screens/hotkey-gating';
import { ThreadBanner } from '@/thread/thread-banner';
import { PanelLayer } from '@/screens/panel-layer';
import { usePanelTabs } from '@/screens/use-panel-tabs';
import { CommandPalette } from '@/palette/command-palette';
import { useCommandPalette } from '@/screens/use-command-palette';
import { ThreadStage } from '@/screens/thread-stage';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import { uiStore } from '@/ui/ui-store';

import { copy } from '@/strings';

/** 空暂存列表的恒定引用（Composer memo 不被每次渲染的新数组击穿）。 */
const EMPTY_QUEUED_MESSAGES: readonly { id: number; text: string }[] = [];

/** ui store 动作引用恒定（zustand 动作创建即稳定），模块级取出，渲染期零重建。 */
const {
  openSidebarSearch,
  openSettings,
  openSettingsAt,
  closeSettings,
  toggleSidebarCollapsed,
  setDraft,
  restoreDraft,
  setConfirmStop,
} = uiStore.getState();

function WorkspaceMain({ workspace }: { workspace: LiveWorkspaceView }): React.JSX.Element {
  /** 草稿按会话隔离：切走再回来不丢，也互不串扰（真相在 ui store） */
  const composerDraft = useStore(uiStore, (s) => s.composerDraft);
  const drafts = useStore(uiStore, (s) => s.drafts);
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
  /** 输入卡图片回填一次性信号（fork/排队编辑经 controller 写入；M1 经本订阅喂 props） */
  const composerRestore = useStore(uiStore, (s) => s.composerRestore);
  /** Usage 总览页（I2；侧栏 footer 入口） */
  const usagePanel = useUsagePanel(workspace.sessions, workspace.statsById, workspace.actions.refreshAllStats);
  /** 输入浮层实际高度：消息流底部避让（贴底内容完整可见，上翻内容滑入浮层后面）。 */
  const [bottomInset, setBottomInset] = React.useState(160);
  const composerLayerRef = useObservedHeight<HTMLDivElement>((height) => {
    setBottomInset(Math.round(height) + 24);
  });
  /** 编辑重发：回填草稿后聚焦输入框（对象 ref——子件光标定位只认对象 ref） */
  const composerTextRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { sessions, activeThreadId } = workspace;

  const draft = drafts[activeThreadId] ?? composerDraft;
  /** 当前会话草稿写入（store 动作恒定，仅随活跃线程换绑） */
  const setThreadDraft = React.useCallback(
    (value: string) => setDraft(activeThreadId, value),
    [activeThreadId],
  );

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
  /** 跨区聚焦通道的 textarea 注册：以输入卡在场为 dep——新建任务页整页替换会卸载
   * 输入卡，重挂后必须换绑新 textarea（固定 [] 会在往返后持有已 detach 的旧元素）。 */
  const composerMounted = newTask.screen === null;
  React.useEffect(() => {
    if (!composerMounted) return;
    const el = composerTextRef.current;
    if (el === null) return;
    registerComposerTextarea(el);
    return () => unregisterComposerTextarea(el);
  }, [composerMounted]);
  const openNewTask = React.useCallback(() => newTask.enter(''), [newTask.enter]);
  /** 当前会话目录的分支视图（只读展示）；revision = 新建任务页 checkout 成功的失效信号 */
  const gitBranches = useGitBranches(workspace.activeCwd, workspace.actions.listGitBranches, newTask.branchRevision);
  /** 分支段 props 引用稳定（避免无关 store 变更时无谓重渲输入卡） */
  const threadBranch = React.useMemo(
    () => branchSegmentOf(gitBranches.view, gitBranches.loading, gitBranches.failed),
    [gitBranches.view, gitBranches.loading, gitBranches.failed],
  );
  /** 面板系统（多标签 + 会话记忆 + 文件查看 + 打开文件弹窗）单一装配面。 */
  const panels = usePanelTabs(activeThreadId, workspace.activeCwd, workspace.actions.searchFilesIn);
  const { panel, panelOpen, togglePanelFromHeader, openAgents, openDiff, toggleAgentsPane, toggleDiffPane, closePanel, openFilePicker } = panels;

  /** 立即改向/编辑/移除共用的暂存投递（单一真相在 useLiveWorkspace 装配面） */
  const submitQueuedDraft = workspace.submitQueuedDraft;

  /** 立即改向：先移除卡片再以 steer 投递（失败自动回插，通知走 submitThreadDraft） */
  const sendNowQueuedMessage = React.useCallback(
    (id: number): void => {
      void queuedDrafts.sendNow(activeThreadId, id, submitQueuedDraft);
    },
    [activeThreadId, submitQueuedDraft],
  );
  const removeQueuedMessage = React.useCallback(
    (id: number): void => {
      queuedDrafts.remove(activeThreadId, id);
    },
    [activeThreadId],
  );

  /** 宿主掉线（从未构建或 failed）：置顶横幅 + 模型位换「宿主未连接」，不得伪装成「未配置模型」。 */
  const hostDown = workspace.hostPhase === null || workspace.hostPhase === 'failed';
  /** 「+视图」菜单：打开并聚焦对应面板 tab（toggle 语义只保留给快捷键）。 */
  const onViewAction = React.useCallback(
    (id: string) => {
      if (id === 'diff') openDiff();
      else if (id === 'agents') openAgents();
      else if (id === 'openFile') openFilePicker();
    },
    [openDiff, openAgents, openFilePicker],
  );
  const selectPermissionMode = React.useCallback(
    (mode: PermissionRules['mode']) => {
      void workspace.actions.setSessionPermissionMode(mode);
    },
    [workspace.actions],
  );
  const followPermissionGlobal = React.useCallback(() => {
    void workspace.actions.writeSessionRules(null);
  }, [workspace.actions]);

  /** 命令面板（⌘P）装配：开关/条目/派发（hub 对话框模态期间不唤起）。 */
  const commandPalette = useCommandPalette({
    workspace,
    activeThreadId,
    sessions,
    openNewTask,
    panels,
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
    { onNewThread: openNewTask, onSearch: openSidebarSearch, onToggleDiff: toggleDiffPane, onToggleAgents: toggleAgentsPane, onPalette: togglePalette },
    hotkeysEnabled,
    paletteHotkeyEnabled,
  );

  useEscDismiss({
    /** 本地浮层也算对话框：浮层自行消费 Esc，全局链不穿透关闭整页 */
    dialogCount: workspace.dialogs.length + (newTask.dialogOpen ? 1 : 0),
    paletteOpen,
    onPaletteClose: closePalette,
    panelOpen: panel.activeId !== null,
    onPanelClose: closePanel,
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
            <ThreadStage
              workspace={workspace}
              activeThreadId={activeThreadId}
              sidebarCollapsed={sidebarCollapsed}
              hostDown={hostDown}
              bottomInset={bottomInset}
              onOpenSettings={openSettings}
              onOpenDiff={openDiff}
              panelOpen={panelOpen}
              onTogglePanel={togglePanelFromHeader}
              onViewAction={onViewAction}
              onEditUserMessage={editUserMessage}
              onForkUserMessage={forkUserMessage}
            />
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
          <ThreadBanner
            crashed={workspace.crashed}
            compacting={workspace.compacting}
            retrying={workspace.retrying}
            queueCount={workspace.queueCount}
            bashRunning={workspace.bashRunning}
            bashTail={workspace.bashTail}
          />
          <Composer
            textareaRef={composerTextRef}
            value={draft}
            placeholder={copy.composer.placeholder}
            attachLabel={copy.composer.attach}
            sendLabel={copy.composer.send}
            stopLabel={copy.composer.stop}
            contextUsageLabel={copy.composer.contextUsage}
            contextUsed={workspace.composer.contextUsed}
            model={workspace.composer.model}
            effort={workspace.composer.effort}
            cwd={workspace.activeCwd}
            branch={threadBranch}
            modelOptions={workspace.composer.modelOptions}
            effortOptions={workspace.composer.effortOptions}
            permissionMode={workspace.sessionRules === null ? null : workspace.sessionRules.rules.mode}
            permissionFollowsGlobal={workspace.sessionRules?.source !== 'thread'}
            commands={workspace.commands}
            slashAriaLabel={copy.composer.slashAria}
            fileAriaLabel={copy.composer.fileAria}
            onSearchFiles={workspace.actions.searchFiles}
            stats={workspace.activeStats}
            threadId={activeThreadId}
            noModelsLabel={hostDown ? copy.composer.hostDownModels : copy.composer.noModels}
            effortUnavailableLabel={copy.composer.effortUnavailable}
            generating={workspace.generating}
            queuedMessages={workspace.queuedDrafts[activeThreadId] ?? EMPTY_QUEUED_MESSAGES}
            onSendNowQueued={sendNowQueuedMessage}
            onEditQueued={editQueuedDraft}
            onRemoveQueued={removeQueuedMessage}
            restore={composerRestore}
            onChange={setThreadDraft}
            onSubmit={submitComposerDraft}
            onStop={stopOrAbort}
            onOpenSettings={openSettings}
            onSelectModel={workspace.actions.selectModel}
            onSelectEffort={workspace.actions.selectEffort}
            onSelectPermissionMode={selectPermissionMode}
            onFollowPermissionGlobal={followPermissionGlobal}
            agentsWorking={workspace.agentsWorking}
            onOpenAgents={openAgents}
          />
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
      <PanelLayer panels={panels} workspace={workspace} />
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
