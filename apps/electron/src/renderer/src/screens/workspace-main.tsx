import * as React from 'react';

import type { PermissionRules } from '@paiapp/contracts';

import { Composer } from '@/composer/composer';
import { DialogLayer } from '@/dialogs/dialog-layer';
import { NewTaskScreen } from '@/screens/new-task-screen';
import { useNewTaskPage } from '@/screens/use-new-task-page';
import { createNavigationHandlers } from '@/screens/workspace-navigation';
import { TitleBarLeft } from '@/layout/title-bar-left';
import { WindowCaptionButtons } from '@/layout/window-caption-buttons';
import { isWindowsPlatform, MODIFIER_KEY_LABEL } from '@/lib/platform';
import { baseNameOf } from '@/lib/project-dirs';
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
import { isImmediateSubmit, submitDraftText } from '@/screens/submit-draft';
import { imagePayloadOf, type PendingImage } from '@/composer/read-image-file';
import { queuedDrafts } from '@/composer/queued-drafts';
import { branchSegmentOf } from '@/composer/branch-segment';
import type { ComposerAttachment } from '@/composer/prompt-card';
import { useGitBranches } from '@/hooks/use-git-branches';
import { useUsagePanel } from '@/hooks/use-usage-panel';
import { useRuntimePanel } from '@/hooks/use-runtime-panel';
import { useProjectFiles } from '@/hooks/use-project-files';
import { useSettingsScreen } from '@/settings/use-settings-screen';
import { StopConfirmBar } from '@/thread/stop-confirm-bar';
import { UsageScreen } from '@/screens/usage-screen';
import { RuntimeScreen } from '@/screens/runtime-screen';
import type { SidePanel } from '@/screens/esc-action';
import { useEscDismiss } from '@/screens/use-esc-dismiss';
import { ThreadBanner } from '@/thread/thread-banner';
import { AgentPanel } from '@/agent-panel/agent-panel';
import { DiffPanel } from '@/diff-panel/diff-panel';
import { ThreadStage } from '@/screens/thread-stage';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';

import { copy } from '@/strings';

const SIDEBAR_WIDTH = 264;
const SIDEBAR_MIN_WIDTH = 208;
const SIDEBAR_MAX_WIDTH = 400;
/** 空暂存列表的恒定引用（Composer memo 不被每次渲染的新数组击穿）。 */
const EMPTY_QUEUED_MESSAGES: readonly { id: number; text: string }[] = [];
/** 侧栏宽度上下限与默认值 */

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
  const [settingsOpen, setSettingsOpen] = React.useState(uiState.settingsOpen);
  /** 停止确认（H2：存在在途子代理时二次确认，不可恢复） */
  const [confirmStop, setConfirmStop] = React.useState(false);
  /** Usage 总览页（I2；侧栏 footer 入口） */
  const usagePanel = useUsagePanel(workspace.sessions, workspace.statsById, workspace.actions.refreshAllStats);
  /** 运行状态页（T29；侧栏快捷行入口；开启期间 2s 轮询快照） */
  const runtimePanel = useRuntimePanel(workspace.actions, {
    sessions: workspace.sessionById,
    statsById: workspace.statsById,
    queueCountOf: workspace.queueCountOf,
  });
  const [panel, setPanel] = React.useState<SidePanel>(null);
  /** 输入浮层实际高度：消息流底部避让（贴底内容完整可见，上翻内容滑入浮层后面）。 */
  const [bottomInset, setBottomInset] = React.useState(160);
  const composerLayerRef = useObservedHeight<HTMLDivElement>((height) => {
    setBottomInset(Math.round(height) + 24);
  });
  /** 编辑重发：回填草稿后聚焦输入框 */
  const composerTextRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { width } = useSidebarResize(uiState.sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  const { sessions, activeThreadId } = workspace;

  const draft = drafts[activeThreadId] ?? composerDraft;
  /** 以下回调均 useCallback：Composer 是 memo 边界，内联函数会把它击穿（流式 delta 每批重渲输入卡） */
  const setDraft = React.useCallback(
    (value: string) => {
      setComposerDraft(value);
      uiState.composerDraft = value;
      if (activeThreadId.length === 0) return;
      setDrafts((current) => ({ ...current, [activeThreadId]: value }));
    },
    [activeThreadId],
  );
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

  const clearDraft = React.useCallback(() => {
    setComposerDraft('');
    setDrafts((current) => {
      if (!(activeThreadId in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== activeThreadId));
    });
  }, [activeThreadId]);

  const usageOpen = usagePanel.usageOpen;
  const closeUsage = usagePanel.closeUsage;
  const runtimeOpen = runtimePanel.open;
  const closeRuntime = runtimePanel.closeRuntime;
  const openSettings = React.useCallback(() => setSettingsOpen(true), []);
  const closeSettings = React.useCallback(() => setSettingsOpen(false), []);
  /** 界面语言与全部设置页数据/动作经 use-settings-screen 装配（语言广播后 app 根重挂载） */
  const settings = useSettingsScreen({ workspace, open: settingsOpen, onClose: closeSettings });
  /** 首条消息未投出时回填到新会话草稿槽（新建任务页退出后仍可重发） */
  const restoreNewTaskDraft = React.useCallback((threadId: string, text: string) => {
    setDrafts((current) => ({ ...current, [threadId]: text }));
  }, []);
  /** 新建任务页：生命周期与渲染属性装配（退出出口集中在该 hook 的 close） */
  const newTask = useNewTaskPage({ workspace, onOpenSettings: openSettings, onDraftRestore: restoreNewTaskDraft });
  const openNewTask = React.useCallback(() => newTask.enter(''), [newTask]);
  const closeNewTask = newTask.close;
  /** 当前会话目录的分支视图（只读展示）；revision = 新建任务页 checkout 成功的失效信号 */
  const gitBranches = useGitBranches(workspace.activeCwd, workspace.actions.listGitBranches, newTask.branchRevision);
  /** 分支段 props 引用稳定（避免无关 store 变更时无谓重渲输入卡） */
  const threadBranch = React.useMemo(
    () => branchSegmentOf(gitBranches.view, gitBranches.loading, gitBranches.failed),
    [gitBranches.view, gitBranches.loading, gitBranches.failed],
  );
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
  const openNewThreadInProject = React.useCallback((cwd: string) => newTask.enter(cwd), [newTask]);
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
    workspace.dialogs.length === 0 && !newTask.open && !usageOpen && !runtimeOpen && !settingsOpen && projectFilesView.target === null;
  useCmdHotkeys({ onNewThread: openNewTask, onSearch: openSidebarSearch }, hotkeysEnabled);

  /** 分叉重发（B2/A5）：fork 到该用户消息之前；autoResend=true 原样重发（含图片），
   * 否则回填草稿与附件。仅水化消息可分叉（live 回显是 UUID，对账后才有协议 entryId）。 */
  const forkUserMessage = (entryId: string, text: string, images: ReadonlyArray<{ data: string; mimeType: string }>, autoResend: boolean) => {
    void workspace.actions.forkFromEntry(entryId).then((newThreadId) => {
      if (newThreadId === null) return;
      const payloads = images.map((image) => ({ type: 'image' as const, data: image.data, mimeType: image.mimeType }));
      if (autoResend) {
        // submitDraft 调用时读 store 真相（已是分叉线程）
        void workspace.actions.submitDraft(text, payloads);
      } else {
        // 回填到分叉线程的草稿槽（不得写旧会话键）；图片经一次性 restore 信号并入 composer
        setDrafts((current) => ({ ...current, [newThreadId]: text }));
        if (images.length > 0) {
          restoreSeqRef.current += 1;
          setRestore({
            token: restoreSeqRef.current,
            images: images.map((image, index) => ({ name: copy.flow.forkedImageName(index + 1), payload: image })),
          });
        }
        composerTextRef.current?.focus();
      }
    });
  };

  const editUserMessage = (text: string) => {
    setDraft(text);
    composerTextRef.current?.focus();
  };

  /** 排队消息编辑回填的一次性图片信号（token 自增；composer 按并入处理） */
  const [restore, setRestore] = React.useState<{ token: number; images: readonly { name: string; payload: PendingImage }[] } | null>(null);
  const restoreSeqRef = React.useRef(0);
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
        clearDraft();
        return Promise.resolve(true);
      }
      return submitDraftText(
        { actions: workspace.actions, clearDraft },
        text,
        attachments.map((item) => imagePayloadOf(item.payload)),
        'auto',
      );
    },
    [activeThreadId, activeSessionPath, clearDraft, workspace.actions, workspace.isThreadStreaming],
  );

  /** 编辑排队消息：取出暂存条目回填草稿与附件（token 信号驱动 composer 吸收图片） */
  const editQueuedMessage = React.useCallback(
    (id: number): void => {
      const draft = queuedDrafts.take(activeThreadId, id);
      if (draft === null) return;
      setDraft(draft.text);
      restoreSeqRef.current += 1;
      setRestore({ token: restoreSeqRef.current, images: draft.images });
      composerTextRef.current?.focus();
    },
    [activeThreadId, setDraft],
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

  const openAgents = React.useCallback(() => setPanel('agents'), []);
  const openDiff = React.useCallback(() => setPanel('diff'), []);
  const closePanel = React.useCallback(() => setPanel(null), []);

  useEscDismiss({
    /** 本地浮层也算对话框：浮层自行消费 Esc，全局链不穿透关闭整页 */
    dialogCount: workspace.dialogs.length + (newTask.dialogOpen ? 1 : 0),
    /** 可见搜索才参与 Esc 链：收起态下的搜索不得吞掉一拍 Esc（过滤词保留，展开后恢复） */
    sidebarSearchOpen: searchOpen && !sidebarCollapsed,
    /** 面板同样以可见性参与（替换侧栏内容区，先于侧栏搜索收起） */
    projectFilesOpen: projectFilesView.target !== null && !sidebarCollapsed,
    usageOpen,
    runtimeOpen,
    newTaskOpen: newTask.open,
    settingsOpen,
    panel,
    bashRunning: workspace.bashRunning,
    confirmStop,
    generating: workspace.generating,
    agentsActive: workspace.agentsActive,
    abortBash: workspace.actions.abortBash,
    stopActiveTurn: workspace.actions.stopActiveTurn,
    onSidebarSearchClose: closeSidebarSearch,
    onRuntimeClose: closeRuntime,
    onProjectFilesClose: projectFilesView.close,
    onUsageClose: closeUsage,
    onNewTaskClose: closeNewTask,
    onSettingsClose: closeSettings,
    onPanelClose: closePanel,
    onConfirmStopChange: setConfirmStop,
  });

  const refreshSaved = workspace.actions.refreshSaved;
  const refreshAction = React.useMemo(() => ({ label: copy.sidebar.refresh, onSelect: refreshSaved }), [refreshSaved]);
  /** 宿主掉线（从未构建或 failed）：置顶横幅 + 模型位换「宿主未连接」，不得伪装成「未配置模型」。 */
  const hostDown = workspace.hostPhase === null || workspace.hostPhase === 'failed';
  /** 运行状态入口异常亮标：宿主相位非 ready 或存在 dead worker（hook 视图派生，不进 store）。 */
  const runtimeAttention = React.useMemo(() => {
    if (workspace.hostPhase !== 'ready') return true;
    return Object.values(workspace.sessionById).some((session) => session.state === 'dead');
  }, [workspace.hostPhase, workspace.sessionById]);
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
  /** 侧栏行内回收（T29）：worker 转 parked，会话保留可唤醒；失败通知条由 action 内部给出。 */
  const retireSession = React.useCallback((threadId: string) => void workspace.actions.retireSession(threadId), [workspace.actions]);
  /** 运行状态页「打开会话」：选中即导航（parked 自动唤醒），并收起整页。 */
  const openSessionFromRuntime = React.useCallback(
    (threadId: string) => {
      workspace.actions.selectSession(threadId);
      closeRuntime();
    },
    [workspace.actions, closeRuntime],
  );

  /** 侧栏/顶栏回调与常量 props：引用恒定（actions 已稳定），Sidebar/ThreadHeader memo 不被父级重渲击穿。 */
  const navigation = React.useMemo(
    () =>
      createNavigationHandlers({
        closeNewTask,
        selectSession: workspace.actions.selectSession,
        openSavedSession: (sessionPath) => void workspace.actions.openSavedSession(sessionPath),
        closePanel,
        closeSettings,
      }),
    [closeNewTask, workspace.actions, closePanel, closeSettings],
  );
  const onSelectSession = navigation.onSelectSession;
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
        onNewThread={openNewTask}
        onCollapseSidebar={collapseSidebar}
        onSelectSession={onSelectSession}
        onOpenRuntime={runtimePanel.openRuntime}
        runtimeAttention={runtimeAttention}
        onCloseSession={workspace.actions.closeSession}
        onRenameSession={onRenameSession}
        onTogglePin={onTogglePin}
        onRetireSession={retireSession}
        onNewTaskInProject={openNewThreadInProject}
        onRemoveProject={removeProject}
        onProjectFiles={showProjectFiles}
        projectFiles={projectFilesView.target === null ? null : { ...projectFilesView.target, tree: projectFilesView.tree, loading: projectFilesView.loading }}
        onCloseProjectFiles={projectFilesView.close}
        footerActions={footerActions}
        refreshAction={refreshAction}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {newTask.screen === null ? (
          <>
            <ThreadStage
              workspace={workspace}
              activeThreadId={activeThreadId}
              sidebarCollapsed={sidebarCollapsed}
              panel={panel}
              onToggleSplitView={onToggleSplitView}
              hostDown={hostDown}
              bottomInset={bottomInset}
              onOpenSettings={openSettings}
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
            onChange={setDraft}
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
      {runtimeOpen ? (
        <RuntimeScreen
          snapshot={runtimePanel.snapshot}
          rows={runtimePanel.rows}
          diagnosticLog={runtimePanel.diagnosticLog}
          actions={workspace.actions}
          onLoadDiagnosticLog={runtimePanel.loadDiagnosticLog}
          onClose={closeRuntime}
          onOpenSession={openSessionFromRuntime}
        />
      ) : null}
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
