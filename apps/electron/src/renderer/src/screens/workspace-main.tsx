import * as React from 'react';

import { Composer } from '@/composer/composer';
import { DialogLayer } from '@/dialogs/dialog-layer';
import { NewThreadModal } from '@/dialogs/new-thread-modal';
import { TitleBarLeft } from '@/layout/title-bar-left';
import { WindowCaptionButtons } from '@/layout/window-caption-buttons';
import { isWindowsPlatform, MODIFIER_KEY_LABEL } from '@/lib/platform';
import { baseNameOf, projectDirsOf } from '@/lib/project-dirs';
import { useSidebarResize } from '@/hooks/use-sidebar-resize';
import { useObservedHeight } from '@/hooks/use-observed-height';
import { useCmdHotkeys } from '@/hooks/cmd-hotkeys';
import { useSessionAges } from '@/hooks/use-session-ages';
import { NoticeStrip } from '@/notices/notice-strip';
import { SettingsScreen } from '@/settings/settings-screen';
import { Sidebar } from '@/sidebar/sidebar';
import type { SidebarView } from '@/sidebar/sidebar-view';
import type { SidebarFooterAction } from '@/sidebar/sidebar-footer';
import { toggleGroupFold, expandGroup, type GroupFold } from '@/sidebar/group-collapse';
import { buildSidebarViewModel } from '@/screens/sidebar-view-model';
import { submitDraftText } from '@/screens/submit-draft';
import { useUsagePanel } from '@/hooks/use-usage-panel';
import { useProjectFiles } from '@/hooks/use-project-files';
import { changeLocale, getLocale, type Locale } from '@/strings';
import { StopConfirmBar } from '@/thread/stop-confirm-bar';
import { QueuePanel } from '@/thread/queue-panel';
import { UsageScreen } from '@/screens/usage-screen';
import type { SidePanel } from '@/screens/esc-action';
import { useEscDismiss } from '@/screens/use-esc-dismiss';
import { ThreadBanner } from '@/thread/thread-banner';
import { AgentPanel } from '@/agent-panel/agent-panel';
import { DiffPanel } from '@/diff-panel/diff-panel';
import { ThreadStage } from '@/screens/thread-stage';
import type { ImagePayload } from '@paiapp/contracts';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';

import { copy } from '@/strings';

const SIDEBAR_WIDTH = 264;
const SIDEBAR_MIN_WIDTH = 208;
const SIDEBAR_MAX_WIDTH = 400;
/** 新会话已知目录快捷条目上限（更多走系统文件夹选择）。 */
const KNOWN_DIRS_LIMIT = 6;

/** 语言切换触发根级重挂载时需要存续的 UI 态（会话草稿/侧栏几何与视图/开合/过滤词）。 */
const uiState = {
  composerDraft: '',
  drafts: {} as Record<string, string>,
  sidebarWidth: SIDEBAR_WIDTH,
  sidebarCollapsed: false,
  sidebarView: 'grouped' as SidebarView,
  sidebarSearchOpen: false,
  sidebarQuery: '',
  sidebarGroupFold: { collapsed: new Set<string>(), expanded: new Set<string>() } as GroupFold,
  settingsOpen: false,
};

/** 尚未接线/不适用当前会话的动作统一落到空实现，接线点保持稳定。 */
function noop(): void {}

function WorkspaceMain({ workspace }: { workspace: LiveWorkspaceView }): React.JSX.Element {
  const [composerDraft, setComposerDraft] = React.useState(uiState.composerDraft);
  /** 草稿按会话隔离：切走再回来不丢，也互不串扰 */
  const [drafts, setDrafts] = React.useState<Readonly<Record<string, string>>>(uiState.drafts);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(uiState.sidebarCollapsed);
  /** 侧栏视图（T17）：分组 = 时间平铺，项目 = 项目分组树 */
  const [sidebarView, setSidebarView] = React.useState<SidebarView>(uiState.sidebarView);
  /** 侧栏会话过滤查询：按标题/项目名过滤；收起侧栏保留过滤词（桌面惯例），Esc 收起并清空 */
  const [sidebarQuery, setSidebarQuery] = React.useState(uiState.sidebarQuery);
  const [searchOpen, setSearchOpen] = React.useState(uiState.sidebarSearchOpen);
  /** ⌘K/快捷行聚焦信号：每次触发递增，驱动已展开的搜索框重新聚焦 */
  const [searchFocusToken, setSearchFocusToken] = React.useState(0);
  /** 项目组折叠面：文件夹行折叠集合 + 「显示更多」展开集合（折叠联动重置） */
  const [groupFold, setGroupFold] = React.useState<GroupFold>(uiState.sidebarGroupFold);
  /** 项目文件面板（T18）：目标/树/加载态（null = 关闭，侧栏内容区照旧） */
  const projectFilesView = useProjectFiles(workspace.actions.listProjectFiles);
  /** 项目内新建任务的预填目录；'' = 用当前会话目录 */
  const [newThreadCwd, setNewThreadCwd] = React.useState('');
  /** 面板开合挂在会话之上：切换会话不丢失 */
  const [settingsOpen, setSettingsOpen] = React.useState(uiState.settingsOpen);
  /** 排队消息面板开合（A7；横幅排队行点击切换） */
  const [queueOpen, setQueueOpen] = React.useState(false);
  /** 停止确认（H2：存在在途子代理时二次确认，不可恢复） */
  const [confirmStop, setConfirmStop] = React.useState(false);
  /** Usage 总览页（I2；侧栏 footer 入口） */
  const usagePanel = useUsagePanel(workspace.sessions, workspace.statsById, workspace.actions.refreshAllStats);
  const [panel, setPanel] = React.useState<SidePanel>(null);
  /** 输入浮层实际高度：消息流底部避让（贴底内容完整可见，上翻内容滑入浮层后面）。 */
  const [bottomInset, setBottomInset] = React.useState(160);
  const composerLayerRef = useObservedHeight<HTMLDivElement>((height) => {
    setBottomInset(Math.round(height) + 24);
  });
  /** 界面语言镜像（changeLocale 广播后 app 根重挂载；此 state 驱动设置分区即时刷新） */
  const [language, setLanguage] = React.useState<Locale>(getLocale());
  const [newThreadOpen, setNewThreadOpen] = React.useState(false);
  /** 编辑重发：回填草稿后聚焦输入框 */
  const composerTextRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { width } = useSidebarResize(uiState.sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  const { sessions, activeThreadId } = workspace;

  const draft = drafts[activeThreadId] ?? composerDraft;
  const setDraft = (value: string) => {
    setComposerDraft(value);
    uiState.composerDraft = value;
    if (activeThreadId.length === 0) return;
    setDrafts((current) => ({ ...current, [activeThreadId]: value }));
  };
  React.useEffect(() => {
    uiState.drafts = { ...drafts };
  }, [drafts]);
  React.useEffect(() => {
    uiState.sidebarWidth = width;
    uiState.sidebarCollapsed = sidebarCollapsed;
    uiState.sidebarView = sidebarView;
    uiState.sidebarSearchOpen = searchOpen;
    uiState.sidebarQuery = sidebarQuery;
    uiState.sidebarGroupFold = groupFold;
    uiState.settingsOpen = settingsOpen;
  }, [width, sidebarCollapsed, sidebarView, searchOpen, sidebarQuery, groupFold, settingsOpen]);

  const clearDraft = () => {
    setComposerDraft('');
    setDrafts((current) => {
      if (!(activeThreadId in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== activeThreadId));
    });
  };

  const usageOpen = usagePanel.usageOpen;
  const closeUsage = usagePanel.closeUsage;
  const openSettings = React.useCallback(() => setSettingsOpen(true), []);
  const closeSettings = React.useCallback(() => setSettingsOpen(false), []);
  const openNewThread = React.useCallback(() => {
    setNewThreadCwd('');
    setNewThreadOpen(true);
  }, []);
  const closeNewThread = React.useCallback(() => setNewThreadOpen(false), []);
  const openSidebarSearch = React.useCallback(() => {
    // 收起态先展开侧栏：⌘K 不得把焦点劫进零宽容器里的隐形输入框
    setSidebarCollapsed(false);
    setSearchOpen(true);
    setSearchFocusToken((token) => token + 1);
  }, []);
  const closeSidebarSearch = React.useCallback(() => {
    setSearchOpen(false);
    setSidebarQuery('');
  }, []);
  const collapseSidebar = React.useCallback(() => setSidebarCollapsed(true), []);
  const openNewThreadInProject = React.useCallback((cwd: string) => {
    setNewThreadCwd(cwd);
    setNewThreadOpen(true);
  }, []);
  const removeProject = React.useCallback(
    (cwd: string) => workspace.actions.removeProject(cwd),
    [workspace.actions],
  );
  const showProjectFiles = React.useCallback(
    (cwd: string) => {
      // 面板占据侧栏内容区，先收侧栏搜索（面板自带搜索框）
      closeSidebarSearch();
      projectFilesView.open(cwd, baseNameOf(cwd) || cwd);
    },
    [projectFilesView, closeSidebarSearch],
  );
  /** 全局 ⌘N/⌘K 在任一模态覆盖/对话框开着时不劫持（模态层优先于全局热键）。 */
  const hotkeysEnabled =
    workspace.dialogs.length === 0 && !usageOpen && !newThreadOpen && !settingsOpen && projectFilesView.target === null;
  useCmdHotkeys({ onNewThread: openNewThread, onSearch: openSidebarSearch }, hotkeysEnabled);

  /** 分叉重发（B2/A5）：fork 到该用户消息之前；autoResend=true 原样重发，否则回填草稿。
   * 仅水化消息可分叉（live 回显是 UUID，对账后才有协议 entryId）。 */
  const forkUserMessage = (entryId: string, text: string, autoResend: boolean) => {
    void workspace.actions.forkFromEntry(entryId).then((newThreadId) => {
      if (newThreadId === null) return;
      if (autoResend) {
        // submitDraft 调用时读 store 真相（已是分叉线程）
        void workspace.actions.submitDraft(text);
      } else {
        // 回填到分叉线程的草稿槽（不得写旧会话键）
        setDrafts((current) => ({ ...current, [newThreadId]: text }));
        composerTextRef.current?.focus();
      }
    });
  };

  const editUserMessage = (text: string) => {
    setDraft(text);
    composerTextRef.current?.focus();
  };

  // 提交语义（`! ` 直执行 / 模型轮次）单一真相在 screens/submit-draft
  const submitDraft = (text: string, images?: readonly ImagePayload[], mode: 'auto' | 'steer' | 'followUp' = 'auto') =>
    submitDraftText({ actions: workspace.actions, clearDraft }, text, images, mode);

  const openAgents = React.useCallback(() => setPanel('agents'), []);
  const openDiff = React.useCallback(() => setPanel('diff'), []);
  const closePanel = React.useCallback(() => setPanel(null), []);

  useEscDismiss({
    dialogCount: workspace.dialogs.length,
    /** 可见搜索才参与 Esc 链：收起态下的搜索不得吞掉一拍 Esc（过滤词保留，展开后恢复） */
    sidebarSearchOpen: searchOpen && !sidebarCollapsed,
    /** 面板同样以可见性参与（替换侧栏内容区，先于侧栏搜索收起） */
    projectFilesOpen: projectFilesView.target !== null && !sidebarCollapsed,
    usageOpen,
    newThreadOpen,
    settingsOpen,
    panel,
    bashRunning: workspace.bashRunning,
    confirmStop,
    generating: workspace.generating,
    agentsActive: workspace.agentsActive,
    abortBash: workspace.actions.abortBash,
    stopActiveTurn: workspace.actions.stopActiveTurn,
    onSidebarSearchClose: closeSidebarSearch,
    onProjectFilesClose: projectFilesView.close,
    onUsageClose: closeUsage,
    onNewThreadClose: closeNewThread,
    onSettingsClose: closeSettings,
    onPanelClose: closePanel,
    onConfirmStopChange: setConfirmStop,
  });

  const refreshSaved = workspace.actions.refreshSaved;
  const refreshAction = React.useMemo(() => ({ label: copy.sidebar.refresh, onSelect: refreshSaved }), [refreshSaved]);
  /** 宿主掉线（从未构建或 failed）：置顶横幅 + 模型位换「宿主未连接」，不得伪装成「未配置模型」。 */
  const hostDown = workspace.hostPhase === null || workspace.hostPhase === 'failed';
  /** 置顶键集合（sessionPath）：设置页已保存列表与侧栏已置顶区共用同一真相。 */
  const pinnedSessions = React.useMemo(() => new Set(workspace.preferences.pinnedSessions), [workspace.preferences.pinnedSessions]);
  /** 已移除（隐藏）项目：两视图共用同一过滤（置顶/分组/项目组三列表同源） */
  const hiddenProjects = React.useMemo(
    () => new Set(workspace.preferences.hiddenProjects),
    [workspace.preferences.hiddenProjects],
  );
  const sidebarLists = React.useMemo(
    () => buildSidebarViewModel(sessions, hiddenProjects, pinnedSessions, sidebarQuery, groupFold.expanded),
    [sessions, hiddenProjects, pinnedSessions, sidebarQuery, groupFold],
  );
  const { pinned: pinnedList, timeList, projectGroups } = sidebarLists;
  const savedProjects = React.useMemo(() => [...new Set(workspace.saved.map((session) => session.cwd))], [workspace.saved]);
  const ages = useSessionAges(sessions);

  const onToggleGroupCollapse = React.useCallback((key: string) => {
    setGroupFold((current) => toggleGroupFold(current, key));
  }, []);
  const onExpandGroup = React.useCallback((key: string) => {
    setGroupFold((current) => expandGroup(current, key));
  }, []);
  const onTogglePin = React.useCallback(
    (sessionPath: string) => workspace.actions.togglePinnedSession(sessionPath),
    [workspace.actions],
  );

  /** 侧栏/顶栏回调与常量 props：引用恒定（actions 已稳定），Sidebar/ThreadHeader memo 不被父级重渲击穿。 */
  const onSelectSession = React.useCallback(
    (sessionId: string) => {
      workspace.actions.selectSession(sessionId);
      setPanel(null);
    },
    [workspace.actions],
  );
  const onRenameSession = React.useCallback(
    (sessionId: string, name: string) => {
      void workspace.actions.renameSession(sessionId, name);
    },
    [workspace.actions],
  );
  const footerActions = React.useMemo<readonly [SidebarFooterAction, SidebarFooterAction, SidebarFooterAction]>(
    () => [
      { label: copy.sidebar.settings, onSelect: openSettings },
      { label: copy.sidebar.workflows, onSelect: noop },
      { label: copy.sidebar.usage, onSelect: usagePanel.openUsage },
    ],
    [openSettings],
  );
  const onToggleSplitView = React.useCallback(() => setPanel((current) => (current === 'agents' ? null : 'agents')), []);

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <Sidebar
        width={width}
        collapsed={sidebarCollapsed}
        view={sidebarView}
        onViewChange={setSidebarView}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        onOpenSearch={openSidebarSearch}
        searchFocusToken={searchFocusToken}
        searchQuery={sidebarQuery}
        onSearchQueryChange={setSidebarQuery}
        pinned={pinnedList}
        timeList={timeList}
        projectGroups={projectGroups}
        collapsedGroups={groupFold.collapsed}
        onToggleGroupCollapse={onToggleGroupCollapse}
        onExpandGroup={onExpandGroup}
        ages={ages}
        activeSessionId={activeThreadId}
        filterEmptyLabel={copy.sidebar.noMatches}
        emptyTasksLabel={copy.sidebar.emptyTasks(copy.sidebar.hotkeyNewTask(MODIFIER_KEY_LABEL))}
        onNewThread={openNewThread}
        onCollapseSidebar={collapseSidebar}
        onSelectSession={onSelectSession}
        onCloseSession={workspace.actions.closeSession}
        onRenameSession={onRenameSession}
        onTogglePin={onTogglePin}
        onNewTaskInProject={openNewThreadInProject}
        onRemoveProject={removeProject}
        onProjectFiles={showProjectFiles}
        projectFiles={projectFilesView.target === null ? null : { ...projectFilesView.target, tree: projectFilesView.tree, loading: projectFilesView.loading }}
        onCloseProjectFiles={projectFilesView.close}
        footerActions={footerActions}
        refreshAction={refreshAction}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <ThreadStage
          workspace={workspace}
          activeThreadId={activeThreadId}
          sidebarCollapsed={sidebarCollapsed}
          panel={panel}
          onToggleSplitView={onToggleSplitView}
          hostDown={hostDown}
          bottomInset={bottomInset}
          onOpenSettings={openSettings}
          onOpenAgents={openAgents}
          onOpenDiff={openDiff}
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
            onToggleQueue={() => setQueueOpen((open) => !open)}
          />
          {queueOpen && workspace.queueCount > 0 ? (
            <QueuePanel
              steering={workspace.queueItems.steering}
              followUp={workspace.queueItems.followUp}
              onClear={workspace.actions.clearQueue}
            />
          ) : null}
          <Composer
            textareaRef={composerTextRef}
            value={draft}
            placeholder={copy.composer.placeholder}
            attachLabel={copy.composer.attach}
            sendLabel={copy.composer.send}
            stopLabel={copy.composer.stop}
            contextUsageLabel={copy.composer.contextUsage}
            compactLabel={copy.composer.compact}
            contextUsed={workspace.composer.contextUsed}
            model={workspace.composer.model}
            effort={workspace.composer.effort}
            checkout={workspace.composer.checkout}
            checkoutLabel={copy.composer.localCheckout}
            modelOptions={workspace.composer.modelOptions}
            effortOptions={workspace.composer.effortOptions}
            checkoutOptions={workspace.composer.checkoutOptions}
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
            compacting={workspace.compacting}
            onChange={setDraft}
            onSubmit={submitDraft}
            onStop={workspace.bashRunning ? workspace.actions.abortBash : workspace.agentsActive && workspace.generating ? () => setConfirmStop(true) : workspace.actions.stopActiveTurn}
            onCompact={workspace.actions.compact}
            onOpenSettings={openSettings}
            onSelectModel={workspace.actions.selectModel}
            onSelectEffort={workspace.actions.selectEffort}
            onSelectPermissionMode={(mode) => {
              void workspace.actions.setSessionPermissionMode(mode);
            }}
            onFollowPermissionGlobal={() => {
              void workspace.actions.writeSessionRules(null);
            }}
            onSelectCheckout={noop}
          />
        </div>
      </div>
      {usageOpen ? <UsageScreen entries={usagePanel.entries} onClose={closeUsage} /> : null}
      {panel === 'agents' ? (
        <AgentPanel agents={workspace.activeThread.agents} now={workspace.now} onClose={closePanel} onSteer={workspace.actions.steerSubagent} />
      ) : null}
      {panel === 'diff' ? <DiffPanel diff={workspace.threadDiff} onClose={closePanel} /> : null}
      <TitleBarLeft
        titleName={copy.appTitle.name}
        titleSuffix={copy.appTitle.suffix}
        toggleLabel={copy.sidebar.toggleSidebar}
        collapsed={sidebarCollapsed}
        sidebarWidth={width}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      {isWindowsPlatform ? <WindowCaptionButtons /> : null}
      <SettingsScreen
        open={settingsOpen}
        providers={workspace.providers}
        credentials={workspace.credentials}
        defaultModel={workspace.preferences.defaultModel}
        modelOptions={workspace.composer.modelOptions}
        permissionRules={workspace.permissionRules}
        agents={workspace.agents}
        skills={workspace.skills}
        saved={workspace.saved}
        pinnedSessions={pinnedSessions}
        savedProjects={savedProjects}
        onTogglePin={workspace.actions.togglePinnedSession}
        onRevealSession={workspace.actions.revealSession}
        onClose={closeSettings}
        onUpsertProvider={workspace.actions.upsertProvider}
        onRemoveProvider={workspace.actions.removeProvider}
        onSelectDefaultModel={workspace.actions.setDefaultModel}
        onTestProvider={workspace.actions.testProvider}
        onSavePermissionRules={workspace.actions.writePermissionRules}
        onShowPermissions={workspace.actions.refreshPermissionRules}
        sessionRules={workspace.sessionRules}
        onSaveSessionRules={workspace.actions.writeSessionRules}
        onLoadSessionRules={workspace.actions.readSessionRules}
        trustedDefault={workspace.preferences.trustedDefault}
        language={language}
        onSaveGeneral={workspace.actions.saveGeneralPreferences}
        onLanguageChange={(next) => {
          changeLocale(next);
          setLanguage(getLocale());
        }}
        diagnostics={workspace.diagnostics}
        onShowDiagnostics={workspace.actions.fetchDiagnostics}
        onRestartHost={workspace.actions.restartHost}
        onShowAgents={workspace.actions.refreshAgents}
        onShowSkills={workspace.actions.refreshSkills}
        onToggleSkill={workspace.actions.setSkillEnabled}
        onOpenSaved={(sessionPath) => {
          void workspace.actions.openSavedSession(sessionPath);
          setSettingsOpen(false);
        }}
        onRefreshSaved={workspace.actions.refreshSaved}
        onSaveKey={workspace.actions.setProviderKey}
        onRemoveKey={workspace.actions.removeProviderKey}
        onRefreshKeys={workspace.actions.refreshCredentials}
      />
      <NewThreadModal
        open={newThreadOpen}
        defaultCwd={newThreadCwd.length > 0 ? newThreadCwd : workspace.activeCwd}
        knownDirs={React.useMemo(
          () =>
            projectDirsOf(
              workspace.sessions.map((session) => ({ cwd: session.cwd, at: session.lastActivityAt })),
              workspace.saved.map((session) => ({ cwd: session.cwd, at: session.modifiedAt })),
              KNOWN_DIRS_LIMIT,
            ),
          [workspace.sessions, workspace.saved],
        )}
        trustedLabel={copy.newThread.trustedLabel}
        trustedHint={copy.newThread.trustedHint}
        onClose={closeNewThread}
        onCreate={workspace.actions.createSession}
        onPickDirectory={workspace.actions.pickDirectory}
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
