import * as React from 'react';
import { useStore } from 'zustand';

import { normalizePermMode, type QueueEntry } from '@paiapp/contracts';

import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { baseNameOf } from '@/lib/project-dirs';
import { copyOfError } from '@/lib/error-text';
import { copy } from '@/strings';
import { imagePayloadOf } from '@/composer/read-image-file';
import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { composerSelectionOf } from '@/composer/composer-selection';
import {
  registerComposerTextarea,
  unregisterComposerTextarea,
} from '@/composer/composer-controller';
import { stopOrAbort } from '@/composer/stop-or-abort';
import { PromptCard, type ComposerAttachment } from '@/composer/prompt-card';
import { PromptContextBar } from '@/composer/prompt-context-bar';
import { PromptInputArea } from '@/composer/prompt-input-area';
import { QueuedMessageCard } from '@/composer/queued-message-card';
import { ConfirmRequestBar } from '@/composer/confirm-request-bar';
import { dialogsOfThread } from '@/dialogs/dialogs-of-thread';
import { BranchPanel } from '@/composer/branch-panel';
import { switchBlockedReason } from '@/composer/branch-switch-guard';
import { ConflictFilesDialog } from '@/composer/conflict-files-dialog';
import { branchSegmentOf } from '@/composer/branch-segment';
import { branchSwitchLockState } from '@/composer/branch-switch-lock';
import { CreateBranchDialog } from '@/composer/create-branch-dialog';
import { useGitBranches } from '@/hooks/use-git-branches';
import { useGitGraph } from '@/hooks/use-git-graph';
import { GitGraphDialog } from '@/git-graph/git-graph-dialog';
import { summarizeAgents } from '@/thread/panel-summary';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/** 排队列表的空态恒定引用（hub 队列镜像的 followUp 条目；后台线程排队不进本区域订阅面）。 */
const EMPTY_QUEUED: readonly QueueEntry[] = [];

/** 本区域互斥浮层：分支面板 → 创建分支弹窗 / 图谱弹窗（同一时刻至多一个）。 */
type ComposerDialog = 'create-branch' | 'graph' | null;

/**
 * 线程页输入卡区域（T33 M2 / T34 M2，0 props）：live/ui store 自订阅 →
 * 组装双页共享的四个子件（子件 props 契约不动）；提交 = 一行 api 动词
 * （发送管线居主进程 session/prompt——流式中 followUp 入队、排队卡片读 hub
 * 队列镜像）；textarea 对象 ref + 本区域挂载 effect 注册 controller 跨区
 * 聚焦通道（区域卸载即注销、重挂即换绑——无 stale 元素窗口）。敲键与流式
 * 增量的重渲半径收敛在本子树内（B-keystroke 回归钉住）。文案直读 copy。
 */
function ComposerRegion(): React.JSX.Element {
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  /** 条目级订阅（非整表）：后台线程的会话更新不进本区域订阅面（B-keystroke 预算） */
  const activeSession = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.sessions[s.activeThreadId]));
  const models = useStore(liveStore, (s) => s.models);
  const activeStats = useStore(liveStore, (s) => s.stats[s.activeThreadId ?? '']) ?? null;
  const activeAnalytics = useStore(liveStore, (s) => s.analytics[s.activeThreadId ?? '']) ?? null;
  const sessionPermissionMode = useStore(liveStore, (s) => s.sessionPermissionMode);
  const hostPhase = useStore(liveStore, (s) => s.hostPhase);
  const commands = useStore(liveStore, (s) => s.commands);
  const thinkingLevel = useStore(liveStore, (s) => s.thinkingLevel);
  const threadState = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]));
  const composerDraft = useStore(uiStore, (s) => s.composerDraft);
  const drafts = useStore(uiStore, (s) => s.drafts);
  const composerRestore = useStore(uiStore, (s) => s.composerRestore);
  const branchRevision = useStore(uiStore, (s) => s.branchRevision);
  /** 排队中消息（hub 队列镜像：queueChanged 事件折叠的 followUp 条目；事件时差内为空态） */
  const queuedMessages = threadState?.queue.followUp ?? EMPTY_QUEUED;
  /** 待答 confirm（只呈现发起会话的——内联确认条随输入卡走，切会话自然不在场）。
   *  两片输入各自引用稳定后经 useMemo 合成：useSyncExternalStore 的 selector 恒返
   *  新数组会击穿 getSnapshot 一致性检查（混合会话弹窗态无限重渲），过滤必须在
   *  memo 层做 */
  const allDialogs = useStore(liveStore, (s) => s.dialogs);
  const pendingDialogs = React.useMemo(() => dialogsOfThread(allDialogs, activeThreadId), [allDialogs, activeThreadId]);

  const value = drafts[activeThreadId] ?? composerDraft;
  const generating = threadState?.streaming ?? false;
  const agentsWorking = summarizeAgents(threadState?.agents ?? []).busyCount;
  const hostDown = hostPhase === null || hostPhase === 'failed';
  // 权限模式（null = 读口未加载——parked 未发 worker 级查询，控件不渲染）
  const permissionMode: string | null = sessionPermissionMode === null ? null : normalizePermMode(sessionPermissionMode.mode, sessionPermissionMode.modes);

  const selection = React.useMemo(
    () => composerSelectionOf(models, activeSession, thinkingLevel),
    [models, activeSession, thinkingLevel],
  );

  const activeCwd = activeSession?.cwd ?? '';
  /** 分支视图拉取居留本区域；失效代次 = 本页或新建任务页 checkout 成功（ui store branchRevision）。 */
  const gitBranches = useGitBranches(activeCwd, workspaceActions.listGitBranches, branchRevision);
  const branch = React.useMemo(
    () => branchSegmentOf(gitBranches.view, gitBranches.loading, gitBranches.failed),
    [gitBranches.view, gitBranches.loading, gitBranches.failed],
  );
  /** 分支切换锁（T36 引用 T23 裁决）：工作目录上任一线程在跑即锁定切换，防切基线拆台
   *  运行中 agent。计数化（D6）：锁因传入面板（「N 个会话运行中」+ 出路提示）；面板
   *  锁时仍可开——静默摘除入口是人机交互反模式；「创建新分支」不受锁（不改工作树）。 */
  // 选择器必须返回稳定值（对象字面量每次新建 → zustand 相等判定恒不等 → 无限渲染）；
  // 拆两个原始值选择器
  const branchLocked = useStore(liveStore, (s) => branchSwitchLockState(s.sessions, s.threads, activeCwd).locked);
  const branchRunningCount = useStore(liveStore, (s) => branchSwitchLockState(s.sessions, s.threads, activeCwd).runningCount);

  const [dialog, setDialog] = React.useState<ComposerDialog>(null);
  /** 分支面板（锚定浮层）开合——与弹窗状态分离（Base UI dismiss 的 onOpenChange(false) 不得冲掉刚开的弹窗） */
  const [branchPanelOpen, setBranchPanelOpen] = React.useState(false);
  const [checkingOut, setCheckingOut] = React.useState(false);
  const [branchError, setBranchError] = React.useState<string | null>(null);
  /** 冲突确认弹窗文件清单（D2'：conflict_files 错误的 message tab 清单） */
  const [conflictFiles, setConflictFiles] = React.useState<string[] | null>(null);
  /** 同步闸：连按 Enter/双击时 state 闭包仍为旧值，异步在途必须用 ref 拦 */
  const busyRef = React.useRef(false);
  /** 发送同线程闸（ref，同步结算）：连按 Enter 去重防双投（异步在途时 state 闭包仍为
   *  旧值，必须用 ref 拦）；投递不再呈 loading——乐观回显即上屏，受理在后台。 */
  const sendingRef = React.useRef<Set<string>>(new Set());
  /** 图谱只在弹窗打开时拉取（无轮询）；branchRevision 让 checkout 成功后重开即新谱 */
  const graph = useGitGraph(activeCwd, workspaceActions.listGitGraph, branchRevision, dialog === 'graph');

  /** 面板打开即重拉：脏计数随工作区实时变化，缓存快照会过期（cwd 不变不会自动重拉）。 */
  React.useEffect(() => {
    if (branchPanelOpen) gitBranches.refresh();
  }, [branchPanelOpen, gitBranches.refresh]);

  const switchBranch = (branchName: string): void => {
    if (busyRef.current) return;
    // 点击时检查（行不禁用）：锁定 → 反馈原因；脏区交 verb 恒重评
    const blocked = switchBlockedReason(branchLocked, branchRunningCount);
    if (blocked !== null) {
      liveStore.getState().pushNotice(blocked);
      return;
    }
    busyRef.current = true;
    setCheckingOut(true);
    setBranchPanelOpen(false);
    void workspaceActions.checkoutGitBranch(activeCwd, branchName, false).then(
      (outcome) => {
        busyRef.current = false;
        setCheckingOut(false);
        if (!outcome.ok) {
          // conflict_files（D2' 试探式真冲突）：弹窗列文件清单（知情裁决）；
          // 其余失败走通知条
          if (outcome.error.kind === 'conflict_files') {
            setConflictFiles((outcome.error.message ?? '').split('\t').filter((f) => f.length > 0));
          } else {
            liveStore.getState().pushNotice(copyOfError(outcome.error));
          }
          return;
        }
        uiStore.getState().bumpBranchRevision();
      },
      () => {
        busyRef.current = false;
        setCheckingOut(false);
      },
    );
  };

  /** 创建并检出：失败在弹窗内联呈现（不关弹窗，便于改名重试）。不受切换锁
   *  （D6 三出路：checkout -b 基于当前 HEAD 建分支并切换——工作树内容不动，不拆台）。 */
  const createBranch = (branchName: string): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    setCheckingOut(true);
    setBranchError(null);
    void workspaceActions.checkoutGitBranch(activeCwd, branchName, true).then(
      (outcome) => {
        busyRef.current = false;
        setCheckingOut(false);
        if (!outcome.ok) {
          setBranchError(copyOfError(outcome.error));
          return;
        }
        setDialog(null);
        uiStore.getState().bumpBranchRevision();
      },
      () => {
        busyRef.current = false;
        setCheckingOut(false);
      },
    );
  };

  const branchPanelAvailable = gitBranches.view?.isRepo === true;
  const conflictDialog = conflictFiles === null ? null : (
    <ConflictFilesDialog files={conflictFiles} onClose={() => setConflictFiles(null)} />
  );

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    registerComposerTextarea(el);
    return () => unregisterComposerTextarea(el);
  }, []);

  /** 发送一行：附件转协议载荷 → submitDraft（乐观回显/`! `路由/排队语义在动作层与
   *  主进程管线内，同 tick 返回）→ 清草稿（失败由动作层回滚：撤气泡 + 文本回填）。
   *  同线程连按 Enter 由 ref 闸拦截。 */
  const submit = (text: string, attachments: readonly ComposerAttachment[]): boolean => {
    if (sendingRef.current.has(activeThreadId)) return false;
    sendingRef.current.add(activeThreadId);
    try {
      const images = attachments.length === 0 ? undefined : attachments.map(({ payload }) => imagePayloadOf(payload));
      if (workspaceActions.submitDraft(text, images) !== null) return false;
      uiStore.getState().clearDraft(activeThreadId);
      return true;
    } finally {
      sendingRef.current.delete(activeThreadId);
    }
  };

  return (
    <div className={`${CONVERSATION_COLUMN_CLASS} pointer-events-auto`}>
      {conflictDialog}
      <PromptContextBar
        project={activeCwd.length === 0 ? null : { label: baseNameOf(activeCwd) || activeCwd, title: activeCwd, ariaLabel: copy.composer.projectSegment }}
        branch={{
          ...branch,
          ariaLabel: copy.composer.branchSegment,
          // 非仓库/加载中/运行中锁定不给面板入口（列表为空或切基线会拆台运行中 agent）
          ...(branchPanelAvailable
            ? {
                panel: {
                  open: branchPanelOpen,
                  onOpenChange: setBranchPanelOpen,
                  content: (
                    <BranchPanel
                      view={gitBranches.view}
                      loading={gitBranches.loading}
                      failed={gitBranches.failed}
                      busy={checkingOut}
                      lock={branchLocked ? { runningCount: branchRunningCount } : null}
                      onSelect={switchBranch}
                      onCreate={() => {
                        setBranchError(null);
                        setBranchPanelOpen(false);
                        setDialog('create-branch');
                      }}
                      onOpenGraph={() => {
                        setBranchPanelOpen(false);
                        setDialog('graph');
                      }}
                    />
                  ),
                },
              }
            : {}),
        }}
      />
      <PromptCard
        className="relative z-[1] -mt-[10px]"
        value={value}
        onSubmit={submit}
        scope={activeThreadId}
        restore={composerRestore}
        canSubmit={value.trim().length > 0}
        queued={
          pendingDialogs.length === 0 && queuedMessages.length === 0
            ? undefined
            : [
                ...(pendingDialogs[0] !== undefined
                  ? [
                      <ConfirmRequestBar
                        key={pendingDialogs[0].requestId}
                        dialog={pendingDialogs[0]}
                        remaining={pendingDialogs.length - 1}
                        onRespond={workspaceActions.respondDialog}
                        onCancel={workspaceActions.cancelDialog}
                      />,
                    ]
                  : []),
                ...queuedMessages.map((entry) => (
                  <QueuedMessageCard
                    key={entry.id}
                    text={entry.text}
                    sendNowLabel={copy.composer.queuedSendNow}
                    editLabel={copy.composer.queuedEdit}
                    removeLabel={copy.composer.queuedRemove}
                    onSendNow={generating ? () => workspaceActions.sendQueuedMessageNow(activeThreadId, entry.id) : undefined}
                    onEdit={() => workspaceActions.editQueuedMessage(activeThreadId, entry.id)}
                    onRemove={() => workspaceActions.removeQueuedMessage(activeThreadId, entry.id)}
                  />
                )),
              ]
        }
        input={
          <PromptInputArea
            value={value}
            onChange={(next) => uiStore.getState().setDraft(activeThreadId, next)}
            placeholder={copy.composer.placeholder}
            textareaRef={textareaRef}
            commands={commands}
            slashAriaLabel={copy.composer.slashAria}
            fileAriaLabel={copy.composer.fileAria}
            onSearchFiles={workspaceActions.searchFiles}
            searchKey={activeCwd}
            queueing={generating}
          />
        }
        actions={({ openFilePicker }) => (
          <ComposerActionsRow
            model={selection.model}
            modelOptions={selection.modelOptions}
            onSelectModel={workspaceActions.selectModel}
            noModelsLabel={hostDown ? copy.composer.hostDownModels : copy.composer.noModels}
            onOpenSettings={() => uiStore.getState().openSettings()}
            attachLabel={copy.composer.attach}
            onAttach={openFilePicker}
            sendLabel={copy.composer.send}
            stopLabel={copy.composer.stop}
            canSend={value.trim().length > 0}
            sending={false}
            generating={generating}
            onStop={stopOrAbort}
            permissionMode={permissionMode}
            permissionModes={sessionPermissionMode?.modes ?? []}
            onSelectPermissionMode={(mode) => void workspaceActions.setSessionPermissionMode(mode)}
            agents={{ working: agentsWorking, onOpen: () => uiStore.getState().openAgentsPane() }}
            effort={{
              value: selection.effort,
              options: selection.effortOptions,
              onSelect: workspaceActions.selectEffort,
            }}
            usage={{ stats: activeStats, analytics: activeAnalytics, label: copy.composer.usageSummary }}
          />
        )}
      />
      <CreateBranchDialog
        open={dialog === 'create-branch'}
        onOpenChange={(open) => setDialog(open ? 'create-branch' : null)}
        busy={checkingOut}
        error={branchError}
        onSubmit={createBranch}
      />
      <GitGraphDialog
        open={dialog === 'graph'}
        onOpenChange={(open) => setDialog(open ? 'graph' : null)}
        view={graph.view}
        loading={graph.loading}
        failed={graph.failed}
        onRefresh={graph.refresh}
      />
    </div>
  );
}

const ComposerRegionMemo = React.memo(ComposerRegion);
export { ComposerRegionMemo as ComposerRegion };
