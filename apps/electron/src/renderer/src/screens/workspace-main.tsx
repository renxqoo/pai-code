import * as React from 'react';

import { Composer } from '@/composer/composer';
import { AgentPanel } from '@/agent-panel/agent-panel';
import { DialogLayer } from '@/dialogs/dialog-layer';
import { NewThreadModal } from '@/dialogs/new-thread-modal';
import { DiffPanel } from '@/diff-panel/diff-panel';
import { SidebarSeparator } from '@/layout/sidebar-separator';
import { TitleBarLeft } from '@/layout/title-bar-left';
import { WindowCaptionButtons } from '@/layout/window-caption-buttons';
import { formatRelativeAge } from '@/lib/relative-age';
import { isWindowsPlatform } from '@/lib/platform';
import { useSidebarResize } from '@/hooks/use-sidebar-resize';
import { NoticeStrip } from '@/notices/notice-strip';
import { SettingsScreen } from '@/settings/settings-screen';
import { Sidebar } from '@/sidebar/sidebar';
import { filterSessions } from '@/sidebar/filter-sessions';
import type { SessionCardModel } from '@/sidebar/session-card-model';
import { MessageList } from '@/thread/message-list';
import { QueuePanel } from '@/thread/queue-panel';
import { ThreadBanner } from '@/thread/thread-banner';
import { ThreadHeader } from '@/thread/thread-header';
import type { ImagePayload } from '@paiapp/contracts';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';

import { copy } from '@/strings';

const SIDEBAR_WIDTH = 188;
const SIDEBAR_MIN_WIDTH = 168;
const SIDEBAR_MAX_WIDTH = 320;
const CONTENT_HORIZONTAL_PADDING = 56;

/** 右侧面板槽位：Diff / Agents 共用一个槽位，互斥切换 */
type SidePanel = 'diff' | 'agents' | null;

/** 尚未接线/不适用当前会话的动作统一落到空实现，接线点保持稳定。 */
function noop(): void {}

function WorkspaceMain({ workspace }: { workspace: LiveWorkspaceView }): React.JSX.Element {
  const [composerDraft, setComposerDraft] = React.useState('');
  /** 草稿按会话隔离：切走再回来不丢，也互不串扰 */
  const [drafts, setDrafts] = React.useState<Readonly<Record<string, string>>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  /** 侧栏会话过滤查询（A3）：按标题/项目名过滤 */
  const [sidebarQuery, setSidebarQuery] = React.useState('');
  /** 折叠的项目分组名集合（A4） */
  const [collapsedGroups, setCollapsedGroups] = React.useState<ReadonlySet<string>>(new Set());
  /** 面板开合挂在会话之上：切换会话不丢失 */
  const [panel, setPanel] = React.useState<SidePanel>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  /** 排队消息面板开合（A7；横幅排队行点击切换） */
  const [queueOpen, setQueueOpen] = React.useState(false);
  const [newThreadOpen, setNewThreadOpen] = React.useState(false);
  /** 编辑重发：回填草稿后聚焦输入框 */
  const composerTextRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { width, dragging, separators } = useSidebarResize(SIDEBAR_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  const { sessions, activeThreadId } = workspace;

  const draft = drafts[activeThreadId] ?? composerDraft;
  const setDraft = (value: string) => {
    setComposerDraft(value);
    if (activeThreadId.length === 0) return;
    setDrafts((current) => ({ ...current, [activeThreadId]: value }));
  };
  const clearDraft = () => {
    setComposerDraft('');
    setDrafts((current) => {
      if (!(activeThreadId in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== activeThreadId));
    });
  };

  const openAgents = React.useCallback(() => setPanel('agents'), []);
  const openDiff = React.useCallback(() => setPanel('diff'), []);
  const closePanel = React.useCallback(() => setPanel(null), []);
  const openSettings = React.useCallback(() => setSettingsOpen(true), []);
  const closeSettings = React.useCallback(() => setSettingsOpen(false), []);
  const openNewThread = React.useCallback(() => setNewThreadOpen(true), []);
  const closeNewThread = React.useCallback(() => setNewThreadOpen(false), []);
  const noopSelectProject = React.useCallback(() => undefined, []);

  /** 分叉重发（B2/A5）：fork 到该用户消息之前；autoResend=true 原样重发，否则回填草稿。
   * 仅水化消息可分叉（live 回显是 UUID，对账后才有协议 entryId）。 */
  const forkUserMessage = (entryId: string, text: string, autoResend: boolean) => {
    void workspace.actions.forkFromEntry(entryId).then((ok) => {
      if (!ok) return;
      if (autoResend) {
        void workspace.actions.submitDraft(text);
      } else {
        setDraft(text);
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
    // 行首 `! ` 前缀 = 直执行命令（B4）：走 bash 通路，不进模型轮次
    if (trimmed.startsWith('!')) {
      const command = trimmed.slice(1).trim();
      if (command.length === 0) return Promise.resolve(false);
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

  /** Esc 语义：对话框开→交由对话框；设置开→关设置；面板开→收面板；生成中→清队列+停止（api.md 约定） */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (workspace.dialogs.length > 0) return;
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (panel !== null) {
        setPanel(null);
        return;
      }
      if (workspace.bashRunning) workspace.actions.abortBash();
      else if (workspace.generating) workspace.actions.stopActiveTurn();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panel, settingsOpen, workspace.dialogs.length, workspace.generating, workspace.actions]);

  /** 浏览器直开（无 preload）时桥不存在，降级为无动作 */
  const toggleMaximize = () => {
    void window.pai?.window.toggleMaximize();
  };

  const refreshSaved = workspace.actions.refreshSaved;
  const refreshAction = React.useMemo(() => ({ label: copy.sidebar.refresh, onSelect: refreshSaved }), [refreshSaved]);
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
  const pinnedSessions = React.useMemo(() => new Set(workspace.preferences.pinnedSessions), [workspace.preferences.pinnedSessions]);
  const savedProjects = React.useMemo(() => [...new Set(workspace.saved.map((session) => session.cwd))], [workspace.saved]);
  const sessionSkills = React.useMemo(
    () =>
      workspace.commands
        .filter((command) => command.source === 'skill')
        .map((command) => ({ name: command.name.replace(/^skill:/, ''), description: command.description })),
    [workspace.commands],
  );
  const ages = React.useMemo(() => {
    const table: Record<string, string> = {};
    for (const session of sessions) {
      table[session.id] = formatRelativeAge(workspace.now, session.lastActivityAt);
    }
    return table;
  }, [sessions, workspace.now]);

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <Sidebar
        width={width}
        collapsed={sidebarCollapsed}
        labels={{
          search: copy.sidebar.search,
          newThread: copy.sidebar.newThread,
          allProjects: copy.sidebar.allProjects,
          newProject: copy.sidebar.newProject,
          settings: copy.sidebar.settings,
          workflows: copy.sidebar.workflows,
          usage: copy.sidebar.usage,
          refresh: copy.sidebar.refresh,
          clearSearch: copy.sidebar.clearSearch,
        }}
        groups={sessionGroups}
        ages={ages}
        activeSessionId={activeThreadId}
        projects={projects}
        selectedProject={copy.sidebar.allProjects}
        searchQuery={sidebarQuery}
        onSearchQueryChange={setSidebarQuery}
        filterEmptyLabel={copy.sidebar.noMatches}
        footerActions={[
          { label: copy.sidebar.settings, onSelect: openSettings },
          { label: copy.sidebar.workflows, onSelect: noop },
          { label: copy.sidebar.usage, onSelect: noop },
        ]}
        refreshAction={refreshAction}
        onNewThread={openNewThread}
        onSelectProject={noopSelectProject}
        onNewProject={openNewThread}
        onSelectSession={(sessionId) => {
          workspace.actions.selectSession(sessionId);
          setPanel(null);
        }}
        onCloseSession={workspace.actions.closeSession}
        onRenameSession={(sessionId, name) => {
          void workspace.actions.renameSession(sessionId, name);
        }}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
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
            diffLabel: copy.thread.tabDiff,
            diffHint: copy.thread.tabDiffHint,
            agentsLabel: copy.thread.tabAgents,
            addLabel: copy.thread.tabAdd,
            agentsActive: workspace.agentsActive,
            onDiff: openDiff,
            onAgents: openAgents,
            onAdd: noop,
          }}
          activePanel={panel}
          openMenu={[...(workspace.generating ? [] : [copy.thread.reloadTrusted, copy.thread.reloadUntrusted]), ...copy.thread.openMenu]}
          commitMenu={copy.thread.commitMenu}
          onAddAction={noop}
          onOpen={noop}
          onCommit={noop}
          onOpenMenuSelect={(label) => {
            // 受信重开：stop → 同文件 resume(trusted)；其余装饰项维持原空操作
            if (label === copy.thread.reloadTrusted) {
              workspace.actions.reloadSessionTrusted(activeThreadId, true);
            } else if (label === copy.thread.reloadUntrusted) {
              workspace.actions.reloadSessionTrusted(activeThreadId, false);
            }
          }}
          onCommitMenuSelect={noop}
          onToggleSplitView={() => setPanel((current) => (current === 'agents' ? null : 'agents'))}
          onToggleMaximize={toggleMaximize}
        />
        <MessageList
          thread={workspace.activeThread}
          now={workspace.now}
          emptyTitle={copy.thread.emptyTitle}
          emptyHint={copy.thread.emptyHint}
          onOpenAgents={openAgents}
          onOpenDiff={openDiff}
          onEditUserMessage={editUserMessage}
          onForkUserMessage={forkUserMessage}
        />
        <div
          className="shrink-0 pb-[18px]"
          style={{
            paddingLeft: CONTENT_HORIZONTAL_PADDING,
            paddingRight: CONTENT_HORIZONTAL_PADDING,
          }}
        >
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
            commands={workspace.commands}
            slashAriaLabel={copy.composer.slashAria}
            fileAriaLabel={copy.composer.fileAria}
            onSearchFiles={workspace.actions.searchFiles}
            noModelsLabel={copy.composer.noModels}
            effortUnavailableLabel={copy.composer.effortUnavailable}
            generating={workspace.generating}
            compacting={workspace.compacting}
            onChange={setDraft}
            onSubmit={submitDraft}
            onStop={workspace.bashRunning ? workspace.actions.abortBash : workspace.actions.stopActiveTurn}
            onCompact={workspace.actions.compact}
            onOpenSettings={openSettings}
            onSelectModel={workspace.actions.selectModel}
            onSelectEffort={workspace.actions.selectEffort}
            onSelectCheckout={noop}
          />
        </div>
      </div>
      {panel === 'agents' ? <AgentPanel agents={workspace.activeThread.agents} now={workspace.now} onClose={closePanel} /> : null}
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
        skills={sessionSkills}
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
        onShowAgents={workspace.actions.refreshAgents}
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
        defaultCwd={workspace.activeCwd.length > 0 ? workspace.activeCwd : ''}
        trustedLabel={copy.newThread.trustedLabel}
        trustedHint={copy.newThread.trustedHint}
        onClose={closeNewThread}
        onCreate={workspace.actions.createSession}
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
