import * as React from 'react';
import { useStore } from 'zustand';

import type { PermissionRules } from '@paiapp/contracts';

import { Composer } from '@/composer/composer';
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
import { closeProjectFiles } from '@/sidebar/project-files';
import { isImmediateSubmit, submitDraftText } from '@/screens/submit-draft';
import { imagePayloadOf } from '@/composer/read-image-file';
import { queuedDrafts } from '@/composer/queued-drafts';
import { branchSegmentOf } from '@/composer/branch-segment';
import type { ComposerAttachment } from '@/composer/prompt-card';
import { useGitBranches } from '@/hooks/use-git-branches';
import { useUsagePanel } from '@/hooks/use-usage-panel';
import { useSettingsScreen } from '@/settings/use-settings-screen';
import { StopConfirmBar } from '@/thread/stop-confirm-bar';
import { UsageScreen } from '@/screens/usage-screen';
import { useEscDismiss } from '@/screens/use-esc-dismiss';
import { ThreadBanner } from '@/thread/thread-banner';
import { PanelLayer } from '@/screens/panel-layer';
import { usePanelTabs } from '@/screens/use-panel-tabs';
import { CommandPalette } from '@/palette/command-palette';
import { useCommandPalette } from '@/screens/use-command-palette';
import { useForkMessage } from '@/screens/use-fork-message';
import { ThreadStage } from '@/screens/thread-stage';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import { uiStore } from '@/ui/ui-store';

import { copy } from '@/strings';

/** 空暂存列表的恒定引用（Composer memo 不被每次渲染的新数组击穿）。 */
const EMPTY_QUEUED_MESSAGES: readonly { id: number; text: string }[] = [];

/** ui store 动作引用恒定（zustand 动作创建即稳定），模块级取出，渲染期零重建。 */
const {
  openSidebarSearch,
  closeSidebarSearch,
  openSettings,
  openSettingsAt,
  closeSettings,
  toggleSidebarCollapsed,
  setDraft,
  clearDraft,
  restoreDraft,
} = uiStore.getState();

function WorkspaceMain({ workspace }: { workspace: LiveWorkspaceView }): React.JSX.Element {
  /** 草稿按会话隔离：切走再回来不丢，也互不串扰（真相在 ui store） */
  const composerDraft = useStore(uiStore, (s) => s.composerDraft);
  const drafts = useStore(uiStore, (s) => s.drafts);
  const sidebarCollapsed = useStore(uiStore, (s) => s.sidebarCollapsed);
  const searchOpen = useStore(uiStore, (s) => s.sidebarSearchOpen);
  /** 项目文件面板（T18）：开合门控读（target null = 关闭，侧栏内容区照旧） */
  const projectFilesState = useStore(uiStore, (s) => s.projectFiles);
  /** 侧栏宽度：拖拽真相在 ui store（resize 装配在 Sidebar 壳内），标题栏避让消费 */
  const sidebarWidth = useStore(uiStore, (s) => s.sidebarWidth);
  /** 命令面板跳设置分区：进入分区经一次性 entry（关闭即清，普通打开不受影响）。 */
  const settingsOpen = useStore(uiStore, (s) => s.settingsOpen);
  const settingsEntry = useStore(uiStore, (s) => s.settingsEntry);
  /** 停止确认（H2：存在在途子代理时二次确认，不可恢复） */
  const [confirmStop, setConfirmStop] = React.useState(false);
  /** Usage 总览页（I2；侧栏 footer 入口） */
  const usagePanel = useUsagePanel(workspace.sessions, workspace.statsById, workspace.actions.refreshAllStats);
  /** 输入浮层实际高度：消息流底部避让（贴底内容完整可见，上翻内容滑入浮层后面）。 */
  const [bottomInset, setBottomInset] = React.useState(160);
  const composerLayerRef = useObservedHeight<HTMLDivElement>((height) => {
    setBottomInset(Math.round(height) + 24);
  });
  /** 编辑重发：回填草稿后聚焦输入框 */
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
  const openNewTask = React.useCallback(() => newTask.enter(''), [newTask.enter]);
  const closeNewTask = newTask.close;
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

  /** 分叉重发与草稿回填装配（消息行编辑/重试与排队编辑共用）。 */
  const forkMessage = useForkMessage({ actions: workspace.actions, restoreDraft, setDraft: setThreadDraft, composerTextRef });
  const { forkUserMessage, editUserMessage, restore } = forkMessage;

  /** 立即改向/编辑/移除共用的暂存投递（单一真相在 useLiveWorkspace 装配面） */
  const submitQueuedDraft = workspace.submitQueuedDraft;
  /** 活跃会话文件路径（暂存记录路径——重开换 id 时按路径改绑） */
  const activeSessionPath = workspace.sessions.find((session) => session.id === activeThreadId)?.sessionPath ?? null;

  // 提交语义（`! ` 直执行 / 生成中本地暂存 / 模型轮次）单一真相在 screens/submit-draft
  // 与 composer/queued-drafts；composer 交出的附件在此按去向转换（暂存保留原名，直发转 ImagePayload）。
  // 生成中判定读 store 真相（渲染帧快照可能落后一轮结算，落后会把该轮末消息错误暂存）
  const submitDraft = React.useCallback(
    (text: string, attachments: readonly ComposerAttachment[]): Promise<boolean> => {
      const trimmed = text.trim();
      // 生成中普通消息 = 本地暂存（默认轮后发送，轮自然结束冲刷）；直执行与行首
      // 斜杠命令不走暂存（词法单一真相在 submit-draft 的 isImmediateSubmit）
      if (workspace.isThreadStreaming(activeThreadId) && trimmed.length > 0 && !isImmediateSubmit(text)) {
        queuedDrafts.stage(activeThreadId, activeSessionPath, trimmed, attachments.map(({ name, payload }) => ({ name, payload })));
        clearDraft(activeThreadId);
        return Promise.resolve(true);
      }
      return submitDraftText(
        { actions: workspace.actions, clearDraft: () => clearDraft(activeThreadId) },
        text,
        attachments.map((item) => imagePayloadOf(item.payload)),
        'auto',
      );
    },
    [activeThreadId, activeSessionPath, workspace.actions, workspace.isThreadStreaming],
  );

  /** 编辑排队消息：取出暂存条目回填草稿与附件（token 信号驱动 composer 吸收图片） */
  const editQueuedMessage = React.useCallback(
    (id: number): void => {
      const draft = queuedDrafts.take(activeThreadId, id);
      if (draft === null) return;
      setThreadDraft(draft.text);
      forkMessage.takeQueuedImages(draft.images);
      composerTextRef.current?.focus();
    },
    [activeThreadId, setThreadDraft],
  );
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
  /** 停止/中止：bash 在途→中止；有在途子代理→先确认；否则直接停止（与 Esc 链同语义） */
  const stopOrAbort = React.useCallback(() => {
    if (workspace.bashRunning) {
      workspace.actions.abortBash();
      return;
    }
    if (workspace.agentsActive && workspace.generating) {
      setConfirmStop(true);
      return;
    }
    workspace.actions.stopActiveTurn();
  }, [workspace.bashRunning, workspace.agentsActive, workspace.generating, workspace.actions]);
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
    drafts,
    composerDraft,
    setDraft: setThreadDraft,
    composerTextRef,
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

  /** 全局 ⌘N/⌘K 在任一模态覆盖/对话框开着时不劫持（模态层优先于全局热键）。 */
  const hotkeysEnabled =
    workspace.dialogs.length === 0 && !paletteOpen && !newTask.open && !usageOpen && !settingsOpen && projectFilesState.target === null;
  // ⌘P 独立门控：hub 对话框之外，整页覆盖（设置/用量/新建任务）开着也不唤起——
  // 它们的层级盖住面板但 autoFocus 已抢焦点，会变成「不可见地执行动作」（T30 审查 高-3）
  const paletteHotkeyEnabled =
    workspace.dialogs.length === 0 && !newTask.open && !usageOpen && !settingsOpen;
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
    /** 可见搜索才参与 Esc 链：收起态下的搜索不得吞掉一拍 Esc（过滤词保留，展开后恢复） */
    sidebarSearchOpen: searchOpen && !sidebarCollapsed,
    /** 面板同样以可见性参与（替换侧栏内容区，先于侧栏搜索收起） */
    projectFilesOpen: projectFilesState.target !== null && !sidebarCollapsed,
    usageOpen,
    newTaskOpen: newTask.open,
    settingsOpen,
    panelOpen: panel.activeId !== null,
    bashRunning: workspace.bashRunning,
    confirmStop,
    generating: workspace.generating,
    agentsActive: workspace.agentsActive,
    abortBash: workspace.actions.abortBash,
    stopActiveTurn: workspace.actions.stopActiveTurn,
    onSidebarSearchClose: closeSidebarSearch,
    onProjectFilesClose: closeProjectFiles,
    onUsageClose: closeUsage,
    onNewTaskClose: closeNewTask,
    onSettingsClose: closeSettings,
    onPanelClose: closePanel,
    onConfirmStopChange: setConfirmStop,
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
            onEditQueued={editQueuedMessage}
            onRemoveQueued={removeQueuedMessage}
            restore={restore}
            onChange={setThreadDraft}
            onSubmit={submitDraft}
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
