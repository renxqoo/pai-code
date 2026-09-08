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
import { MessageList } from '@/thread/message-list';
import { ThreadBanner } from '@/thread/thread-banner';
import { ThreadHeader } from '@/thread/thread-header';
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
  /** 面板开合挂在会话之上：切换会话不丢失 */
  const [panel, setPanel] = React.useState<SidePanel>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
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

  const editUserMessage = (text: string) => {
    setDraft(text);
    composerTextRef.current?.focus();
  };

  const submitDraft = () => {
    const text = draft.trim();
    if (text.length === 0) return;
    void workspace.actions.submitDraft(text).then((reason) => {
      if (reason === null) clearDraft();
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
      if (workspace.generating) workspace.actions.stopActiveTurn();
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
        sessions={visibleSessions}
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
          openMenu={copy.thread.openMenu}
          commitMenu={copy.thread.commitMenu}
          onAddAction={noop}
          onOpen={noop}
          onCommit={noop}
          onOpenMenuSelect={noop}
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
          />
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
            generating={workspace.generating}
            compacting={workspace.compacting}
            onChange={setDraft}
            onSubmit={submitDraft}
            onStop={workspace.actions.stopActiveTurn}
            onAttach={noop}
            onCompact={workspace.actions.compact}
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
        saved={workspace.saved}
        onClose={closeSettings}
        onUpsertProvider={workspace.actions.upsertProvider}
        onRemoveProvider={workspace.actions.removeProvider}
        onOpenSaved={(sessionPath) => {
          void workspace.actions.openSavedSession(sessionPath);
          setSettingsOpen(false);
        }}
        onRefreshSaved={workspace.actions.refreshSaved}
      />
      <NewThreadModal
        open={newThreadOpen}
        defaultCwd={workspace.activeCwd.length > 0 ? workspace.activeCwd : ''}
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
