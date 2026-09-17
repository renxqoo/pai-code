import * as React from 'react';
import { useStore } from 'zustand';

import type { PermMode } from '@paiapp/contracts';

import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { baseNameOf } from '@/lib/project-dirs';
import { copy } from '@/strings';
import { queuedDrafts } from '@/composer/queued-drafts';
import { submitQueuedDraft } from '@/composer/queued-submit';
import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { composerSelectionOf } from '@/composer/composer-selection';
import { normalizePermMode } from '@/live/permission-mode';
import {
  editQueuedDraft,
  registerComposerTextarea,
  unregisterComposerTextarea,
} from '@/composer/composer-controller';
import { stopOrAbort } from '@/composer/stop-or-abort';
import { submitComposerDraft } from '@/composer/submit-composer-draft';
import { PromptCard } from '@/composer/prompt-card';
import { PromptContextBar } from '@/composer/prompt-context-bar';
import { PromptInputArea } from '@/composer/prompt-input-area';
import { QueuedMessageCard } from '@/composer/queued-message-card';
import { BranchPanel } from '@/composer/branch-panel';
import { branchSegmentOf } from '@/composer/branch-segment';
import { branchSwitchLocked } from '@/composer/branch-switch-lock';
import { CreateBranchDialog } from '@/composer/create-branch-dialog';
import { useGitBranches } from '@/hooks/use-git-branches';
import { useGitGraph } from '@/hooks/use-git-graph';
import { GitGraphDialog } from '@/git-graph/git-graph-dialog';
import { summarizeAgents } from '@/thread/panel-summary';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/** 排队列表的空态恒定引用（按键取快照；后台线程的排队变化不进本区域订阅面）。 */
const EMPTY_QUEUED: readonly { id: number; text: string }[] = [];

/** 本区域互斥浮层：分支面板 → 创建分支弹窗 / 图谱弹窗（同一时刻至多一个）。 */
type ComposerDialog = 'branch' | 'create-branch' | 'graph' | null;

/**
 * 线程页输入卡区域（T33 M2 / T34 M2，0 props）：live/ui store 与 queuedDrafts 自订阅 →
 * 组装双页共享的四个子件（子件 props 契约不动）；提交/停止编排走模块；
 * textarea 对象 ref + 本区域挂载 effect 注册 controller 跨区聚焦通道
 * （区域卸载即注销、重挂即换绑——无 stale 元素窗口）。敲键与流式增量的重渲
 * 半径收敛在本子树内（B-keystroke 回归钉住）。文案直读 copy（hostDown 三态）。
 */
function ComposerRegion(): React.JSX.Element {
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  /** 条目级订阅（非整表）：后台线程的会话更新不进本区域订阅面（B-keystroke 预算） */
  const activeSession = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.sessions[s.activeThreadId]));
  const models = useStore(liveStore, (s) => s.models);
  const activeStats = useStore(liveStore, (s) => s.stats[s.activeThreadId ?? '']) ?? null;
  const sessionPermissionMode = useStore(liveStore, (s) => s.sessionPermissionMode);
  const hostPhase = useStore(liveStore, (s) => s.hostPhase);
  const commands = useStore(liveStore, (s) => s.commands);
  const thinkingLevel = useStore(liveStore, (s) => s.thinkingLevel);
  const threadState = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]));
  const composerDraft = useStore(uiStore, (s) => s.composerDraft);
  const drafts = useStore(uiStore, (s) => s.drafts);
  const composerRestore = useStore(uiStore, (s) => s.composerRestore);
  const branchRevision = useStore(uiStore, (s) => s.branchRevision);
  const queuedMessages = React.useSyncExternalStore(
    queuedDrafts.subscribe,
    () => queuedDrafts.snapshot()[activeThreadId] ?? EMPTY_QUEUED,
    () => EMPTY_QUEUED,
  );

  const value = drafts[activeThreadId] ?? composerDraft;
  const generating = threadState?.streaming ?? false;
  const agentsWorking = summarizeAgents(threadState?.agents ?? []).busyCount;
  const hostDown = hostPhase === null || hostPhase === 'failed';
  // 权限模式（null = 读口未加载——parked 未发 worker 级查询，控件不渲染）
  const permissionMode: PermMode | null = sessionPermissionMode === null ? null : normalizePermMode(sessionPermissionMode.mode);

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
  /** 分支切换锁（T36 引用 T23 裁决）：工作目录上任一线程在跑即只读，防切基线拆台运行中 agent。 */
  const branchLocked = useStore(liveStore, (s) => branchSwitchLocked(s.sessions, s.threads, activeCwd));

  const [dialog, setDialog] = React.useState<ComposerDialog>(null);
  const [checkingOut, setCheckingOut] = React.useState(false);
  const [branchError, setBranchError] = React.useState<string | null>(null);
  /** 同步闸：连按 Enter/双击时 state 闭包仍为旧值，异步在途必须用 ref 拦 */
  const busyRef = React.useRef(false);
  /** 图谱只在弹窗打开时拉取（无轮询）；branchRevision 让 checkout 成功后重开即新谱 */
  const graph = useGitGraph(activeCwd, workspaceActions.listGitGraph, branchRevision, dialog === 'graph');

  /** 锁定期间已开的分支面板/创建弹窗就地收口（触发器会消失，但已开的模态弹窗不会自灭） */
  React.useEffect(() => {
    if (branchLocked && (dialog === 'branch' || dialog === 'create-branch')) setDialog(null);
  }, [branchLocked, dialog]);

  /** 面板打开即重拉：脏计数随工作区实时变化，缓存快照会过期（cwd 不变不会自动重拉） */
  React.useEffect(() => {
    if (dialog === 'branch') gitBranches.refresh();
  }, [dialog, gitBranches.refresh]);

  /** 切分支：失败走通知条；成功 bump 失效代次（本区域分支段与图谱随之重拉） */
  const switchBranch = (branchName: string): void => {
    if (busyRef.current || branchLocked) return;
    busyRef.current = true;
    setCheckingOut(true);
    setDialog(null);
    void workspaceActions.checkoutGitBranch(activeCwd, branchName, false).then(
      (outcome) => {
        busyRef.current = false;
        setCheckingOut(false);
        if (!outcome.ok) {
          liveStore.getState().pushNotice(copy.branch.failed(outcome.reason));
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

  /** 创建并检出：失败在弹窗内联呈现（不关弹窗，便于改名重试）；与切换同一把锁（checkout -b 同样改写 HEAD 归属） */
  const createBranch = (branchName: string): void => {
    if (busyRef.current || branchLocked) return;
    busyRef.current = true;
    setCheckingOut(true);
    setBranchError(null);
    void workspaceActions.checkoutGitBranch(activeCwd, branchName, true).then(
      (outcome) => {
        busyRef.current = false;
        setCheckingOut(false);
        if (!outcome.ok) {
          setBranchError(copy.branch.failed(outcome.reason));
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

  const branchPanelAvailable = gitBranches.view?.isRepo === true && !branchLocked;

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    registerComposerTextarea(el);
    return () => unregisterComposerTextarea(el);
  }, []);

  return (
    <div className={`${CONVERSATION_COLUMN_CLASS} pointer-events-auto`}>
      <PromptContextBar
        project={activeCwd.length === 0 ? null : { label: baseNameOf(activeCwd) || activeCwd, title: activeCwd, ariaLabel: copy.composer.projectSegment }}
        branch={{
          ...branch,
          ariaLabel: copy.composer.branchSegment,
          // 非仓库/加载中/运行中锁定不给面板入口（列表为空或切基线会拆台运行中 agent）
          ...(branchPanelAvailable
            ? {
                panel: {
                  open: dialog === 'branch',
                  onOpenChange: (open: boolean) => setDialog(open ? 'branch' : null),
                  content: (
                    <BranchPanel
                      view={gitBranches.view}
                      loading={gitBranches.loading}
                      failed={gitBranches.failed}
                      busy={checkingOut}
                      onSelect={switchBranch}
                      onCreate={() => {
                        setBranchError(null);
                        setDialog('create-branch');
                      }}
                      onOpenGraph={() => setDialog('graph')}
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
        onSubmit={submitComposerDraft}
        scope={activeThreadId}
        restore={composerRestore}
        canSubmit={value.trim().length > 0}
        queued={
          queuedMessages.length === 0
            ? undefined
            : queuedMessages.map((item) => (
                <QueuedMessageCard
                  key={item.id}
                  text={item.text}
                  sendNowLabel={copy.composer.sendNow}
                  editLabel={copy.composer.editQueued}
                  removeLabel={copy.composer.removeQueued}
                  onSendNow={() => void queuedDrafts.sendNow(activeThreadId, item.id, submitQueuedDraft)}
                  onEdit={() => editQueuedDraft(item.id)}
                  onRemove={() => queuedDrafts.remove(activeThreadId, item.id)}
                />
              ))
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
            generating={generating}
            onStop={stopOrAbort}
            permissionMode={permissionMode}
            onSelectPermissionMode={(mode) => void workspaceActions.setSessionPermissionMode(mode)}
            agents={{ working: agentsWorking, onOpen: () => uiStore.getState().openAgentsPane() }}
            effort={{
              value: selection.effort,
              options: selection.effortOptions,
              onSelect: workspaceActions.selectEffort,
            }}
            usage={{ stats: activeStats, label: copy.composer.usageSummary }}
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
