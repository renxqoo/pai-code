import * as React from 'react';

import { Composer } from '@/composer/composer';
import { DialogLayer } from '@/dialogs/dialog-layer';
import { NewThreadModal } from '@/dialogs/new-thread-modal';
import { SidebarSeparator } from '@/layout/sidebar-separator';
import { TitleBarLeft } from '@/layout/title-bar-left';
import { WindowCaptionButtons } from '@/layout/window-caption-buttons';
import { formatRelativeAge } from '@/lib/relative-age';
import { isWindowsPlatform } from '@/lib/platform';
import { projectDirsOf } from '@/lib/project-dirs';
import { useSidebarResize } from '@/hooks/use-sidebar-resize';
import { useObservedHeight } from '@/hooks/use-observed-height';
import { NoticeStrip } from '@/notices/notice-strip';
import { SettingsScreen } from '@/settings/settings-screen';
import { HostDownBanner } from '@/screens/host-down-banner';
import { Sidebar } from '@/sidebar/sidebar';
import type { SidebarFooterAction } from '@/sidebar/sidebar-footer';
import { filterSessions } from '@/sidebar/filter-sessions';
import { changeLocale, getLocale, type Locale } from '@/strings';
import type { SessionCardModel } from '@/sidebar/session-card-model';
import { MessageList } from '@/thread/message-list';
import { StopConfirmBar } from '@/thread/stop-confirm-bar';
import { QueuePanel } from '@/thread/queue-panel';
import { UsageScreen } from '@/screens/usage-screen';
import { buildUsageEntries } from '@/screens/usage-entries';
import type { SidePanel } from '@/screens/esc-action';
import { useEscDismiss } from '@/screens/use-esc-dismiss';
import { ThreadBanner } from '@/thread/thread-banner';
import { AgentPanel } from '@/agent-panel/agent-panel';
import { DiffPanel } from '@/diff-panel/diff-panel';
import { ThreadHeader } from '@/thread/thread-header';
import type { ImagePayload } from '@paiapp/contracts';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';

import { copy } from '@/strings';

const SIDEBAR_WIDTH = 188;
const SIDEBAR_MIN_WIDTH = 168;
const SIDEBAR_MAX_WIDTH = 320;
/** 新会话已知目录快捷条目上限（更多走系统文件夹选择）。 */
const KNOWN_DIRS_LIMIT = 6;

/** 语言切换触发根级重挂载时需要存续的 UI 态（会话草稿/侧栏几何/开合）。 */
const uiState = {
  composerDraft: '',
  drafts: {} as Record<string, string>,
  sidebarWidth: SIDEBAR_WIDTH,
  sidebarCollapsed: false,
  settingsOpen: false,
};

/** 尚未接线/不适用当前会话的动作统一落到空实现，接线点保持稳定。 */
function noop(): void {}

/** 侧栏静态文案（模块级常量：copy 目录稳定，避免每渲染新对象击穿 Sidebar memo）。 */
const sidebarLabels = {
  search: copy.sidebar.search,
  newThread: copy.sidebar.newThread,
  allProjects: copy.sidebar.allProjects,
  newProject: copy.sidebar.newProject,
  settings: copy.sidebar.settings,
  workflows: copy.sidebar.workflows,
  usage: copy.sidebar.usage,
  refresh: copy.sidebar.refresh,
  clearSearch: copy.sidebar.noMatches,
};

function WorkspaceMain({ workspace }: { workspace: LiveWorkspaceView }): React.JSX.Element {
  const [composerDraft, setComposerDraft] = React.useState(uiState.composerDraft);
  /** 草稿按会话隔离：切走再回来不丢，也互不串扰 */
  const [drafts, setDrafts] = React.useState<Readonly<Record<string, string>>>(uiState.drafts);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(uiState.sidebarCollapsed);
  /** 侧栏会话过滤查询（A3）：按标题/项目名过滤 */
  const [sidebarQuery, setSidebarQuery] = React.useState('');
  /** 折叠的项目分组名集合（A4） */
  const [collapsedGroups, setCollapsedGroups] = React.useState<ReadonlySet<string>>(new Set());
  /** 面板开合挂在会话之上：切换会话不丢失 */
  const [settingsOpen, setSettingsOpen] = React.useState(uiState.settingsOpen);
  /** 排队消息面板开合（A7；横幅排队行点击切换） */
  const [queueOpen, setQueueOpen] = React.useState(false);
  /** 停止确认（H2：存在在途子代理时二次确认，不可恢复） */
  const [confirmStop, setConfirmStop] = React.useState(false);
  /** Usage 总览页（I2；侧栏 footer 入口） */
  const [usageOpen, setUsageOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<SidePanel>(null);
  /** 输入浮层实际高度：消息流底部避让（贴底内容完整可见，上翻内容滑入浮层后面）。 */
  const [bottomInset, setBottomInset] = React.useState(160);
  const composerLayerRef = useObservedHeight<HTMLDivElement>((height) => {
    setBottomInset(Math.round(height) + 24);
  });
  React.useEffect(() => {
    if (usageOpen) workspace.actions.refreshAllStats();
    // eslint 不在此项目；actions 引用不稳，依赖 usageOpen 单轴即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageOpen]);
  /** 界面语言镜像（changeLocale 广播后 app 根重挂载；此 state 驱动设置分区即时刷新） */
  const [language, setLanguage] = React.useState<Locale>(getLocale());
  const [newThreadOpen, setNewThreadOpen] = React.useState(false);
  /** 编辑重发：回填草稿后聚焦输入框 */
  const composerTextRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { width, dragging, separators } = useSidebarResize(uiState.sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
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
    uiState.settingsOpen = settingsOpen;
  }, [width, sidebarCollapsed, settingsOpen]);

  const clearDraft = () => {
    setComposerDraft('');
    setDrafts((current) => {
      if (!(activeThreadId in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== activeThreadId));
    });
  };

  const closeUsage = React.useCallback(() => setUsageOpen(false), []);
  const openSettings = React.useCallback(() => setSettingsOpen(true), []);
  const closeSettings = React.useCallback(() => setSettingsOpen(false), []);
  const openNewThread = React.useCallback(() => setNewThreadOpen(true), []);
  const closeNewThread = React.useCallback(() => setNewThreadOpen(false), []);
  const noopSelectProject = React.useCallback(() => undefined, []);

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

  const submitDraft = (text: string, images?: readonly ImagePayload[], mode: 'auto' | 'steer' | 'followUp' = 'auto') => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return Promise.resolve(false);
    // 行首 `! ` 前缀 = 直执行命令（B4）：走 bash 通路，不进模型轮次；不支持图片
    if (trimmed.startsWith('! ')) {
      const command = trimmed.slice(2).trim();
      if (command.length === 0) return Promise.resolve(false);
      if ((images?.length ?? 0) > 0) {
        workspace.actions.showNotice(copy.flow.bashNoImages);
        return Promise.resolve(false);
      }
      return workspace.actions.runBash(command).then((reason) => {
        if (reason === null) clearDraft();
        return reason === null;
      });
    }
    return workspace.actions.submitDraft(trimmed, images, mode).then((reason) => {
      if (reason === null) clearDraft();
      return reason === null;
    });
  };

  const openAgents = React.useCallback(() => setPanel('agents'), []);
  const openDiff = React.useCallback(() => setPanel('diff'), []);
  const closePanel = React.useCallback(() => setPanel(null), []);

  useEscDismiss({
    dialogCount: workspace.dialogs.length,
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
    onUsageClose: closeUsage,
    onNewThreadClose: closeNewThread,
    onSettingsClose: closeSettings,
    onPanelClose: closePanel,
    onConfirmStopChange: setConfirmStop,
  });

  /** 浏览器直开（无 preload）时桥不存在，降级为无动作 */
  const toggleMaximize = React.useCallback(() => {
    void window.pai?.window.toggleMaximize();
  }, []);

  const refreshSaved = workspace.actions.refreshSaved;
  const refreshAction = React.useMemo(() => ({ label: copy.sidebar.refresh, onSelect: refreshSaved }), [refreshSaved]);
  /** 宿主掉线（从未构建或 failed）：置顶横幅 + 模型位换「宿主未连接」，不得伪装成「未配置模型」。 */
  const hostDown = workspace.hostPhase === null || workspace.hostPhase === 'failed';
  const projects = React.useMemo(() => [...new Set(sessions.map((session) => session.projectName))], [sessions]);
  const visibleSessions = React.useMemo(() => filterSessions(sessions, sidebarQuery), [sessions, sidebarQuery]);
  const sessionGroups = React.useMemo(
    () =>
      [...visibleSessions.reduce((map, session) => {
        const list: SessionCardModel[] = map.get(session.projectName) ?? [];
        list.push(session);
        map.set(session.projectName, list);
        return map;
      }, new Map<string, SessionCardModel[]>())].map(([projectName, list]) => ({
        key: projectName,
        projectName,
        sessions: list,
        collapsed: collapsedGroups.has(projectName),
        onToggle: () =>
          setCollapsedGroups((current) => {
            const next = new Set(current);
            if (next.has(projectName)) next.delete(projectName);
            else next.add(projectName);
            return next;
          }),
      })),
    [visibleSessions, collapsedGroups],
  );
  const usageEntries = React.useMemo(
    () => buildUsageEntries(workspace.sessions, workspace.statsById),
    [workspace.sessions, workspace.statsById],
  );
  const pinnedSessions = React.useMemo(() => new Set(workspace.preferences.pinnedSessions), [workspace.preferences.pinnedSessions]);
  const savedProjects = React.useMemo(() => [...new Set(workspace.saved.map((session) => session.cwd))], [workspace.saved]);
  /** 相对年龄为分钟级粒度：独立低频 tick（静止会话不随流式 tick 重渲，流式 tick 只走消息流）。 */
  const [ageNow, setAgeNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const handle = window.setInterval(() => setAgeNow(Date.now()), 30_000);
    return () => window.clearInterval(handle);
  }, []);
  const ages = React.useMemo(() => {
    const table: Record<string, string> = {};
    for (const session of sessions) {
      table[session.id] = formatRelativeAge(ageNow, session.lastActivityAt);
    }
    return table;
  }, [sessions, ageNow]);

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
      { label: copy.sidebar.usage, onSelect: () => setUsageOpen(true) },
    ],
    [openSettings],
  );
  const onOpenMenuSelect = React.useCallback(
    (label: string) => {
      // 受信重开：stop → 同文件 resume(trusted)；其余装饰项维持原空操作
      if (label === copy.thread.reloadTrusted) {
        workspace.actions.reloadSessionTrusted(activeThreadId, true);
      } else if (label === copy.thread.reloadUntrusted) {
        workspace.actions.reloadSessionTrusted(activeThreadId, false);
      }
    },
    [workspace.actions, activeThreadId],
  );
  const onToggleSplitView = React.useCallback(() => setPanel((current) => (current === 'agents' ? null : 'agents')), []);

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <Sidebar
        width={width}
        collapsed={sidebarCollapsed}
        labels={sidebarLabels}
        groups={sessionGroups}
        ages={ages}
        activeSessionId={activeThreadId}
        projects={projects}
        selectedProject={copy.sidebar.allProjects}
        searchQuery={sidebarQuery}
        onSearchQueryChange={setSidebarQuery}
        filterEmptyLabel={copy.sidebar.noMatches}
        footerActions={footerActions}
        refreshAction={refreshAction}
        onNewThread={openNewThread}
        onSelectProject={noopSelectProject}
        onNewProject={openNewThread}
        onSelectSession={onSelectSession}
        onCloseSession={workspace.actions.closeSession}
        onRenameSession={onRenameSession}
      />
      <div className="relative flex min-w-0 flex-1 flex-col px-[40px]">
        {sidebarCollapsed ? null : (
          <SidebarSeparator
            width={width}
            minWidth={SIDEBAR_MIN_WIDTH}
            maxWidth={SIDEBAR_MAX_WIDTH}
            dragging={dragging}
            label={copy.sidebar.toggleSidebar}
            onResizeStart={separators.onPointerDown}
            onResizeMove={separators.onPointerMove}
            onResizeEnd={separators.onPointerUp}
            onKeyDown={separators.onKeyDown}
          />
        )}
        <ThreadHeader
          projectName={sessions.find((session) => session.id === activeThreadId)?.projectName ?? ''}
          sessionTitle={sessions.find((session) => session.id === activeThreadId)?.title ?? ''}
          sidebarCollapsed={sidebarCollapsed}
          labels={{
            addAction: copy.thread.addAction,
            open: copy.thread.open,
            commitPushPr: copy.thread.commitPushPr,
            toggleSplitView: copy.thread.toggleSplitView,
            toggleMaximize: copy.thread.toggleMaximize,
          }}
          tabs={{
            addLabel: copy.thread.tabAdd,
            onAdd: noop,
          }}
          activePanel={panel}
          openMenu={[...(workspace.generating ? [] : [copy.thread.reloadTrusted, copy.thread.reloadUntrusted]), ...copy.thread.openMenu]}
          commitMenu={copy.thread.commitMenu}
          onAddAction={noop}
          onOpen={noop}
          onCommit={noop}
          onOpenMenuSelect={onOpenMenuSelect}
          onCommitMenuSelect={noop}
          onToggleSplitView={onToggleSplitView}
          onToggleMaximize={toggleMaximize}
        />
        {hostDown ? <HostDownBanner onOpenSettings={openSettings} /> : null}
        <MessageList
          thread={workspace.activeThread}
          now={workspace.now}
          loading={workspace.executing}
          bottomInset={bottomInset}
          emptyTitle={copy.thread.emptyTitle}
          emptyHint={copy.thread.emptyHint}
          onOpenAgents={openAgents}
          onOpenDiff={openDiff}
          onEditUserMessage={editUserMessage}
          onForkUserMessage={forkUserMessage}
        />
        <div ref={composerLayerRef} className="absolute inset-x-0 bottom-0 z-10 bg-background px-[40px] pb-[18px]">
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
      {usageOpen ? <UsageScreen entries={usageEntries} onClose={() => setUsageOpen(false)} /> : null}
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
        defaultCwd={workspace.activeCwd}
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
