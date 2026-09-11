import * as React from 'react';
import { useStore } from 'zustand';

import type { PermissionRules } from '@paiapp/contracts';

import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { baseNameOf } from '@/lib/project-dirs';
import { copy } from '@/strings';
import { queuedDrafts } from '@/composer/queued-drafts';
import { submitQueuedDraft } from '@/composer/queued-submit';
import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { composerSelectionOf } from '@/composer/composer-selection';
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
import { branchSegmentOf } from '@/composer/branch-segment';
import { useGitBranches } from '@/hooks/use-git-branches';
import { summarizeAgents } from '@/thread/panel-summary';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/** 排队列表的空态恒定引用（按键取快照；后台线程的排队变化不进本区域订阅面）。 */
const EMPTY_QUEUED: readonly { id: number; text: string }[] = [];

/**
 * 线程页输入卡区域（T33 M2 / T34 M2，0 props）：live/ui store 与 queuedDrafts 自订阅 →
 * 组装双页共享的四个子件（子件 props 契约不动）；提交/停止编排走模块；
 * textarea 对象 ref + 本区域挂载 effect 注册 controller 跨区聚焦通道
 * （区域卸载即注销、重挂即换绑——无 stale 元素窗口）。敲键与流式批推的重渲
 * 半径收敛在本子树内（B-keystroke 回归钉住）。文案直读 copy（hostDown 三态）。
 */
function ComposerRegion(): React.JSX.Element {
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  /** 条目级订阅（非整表）：后台线程的会话更新不进本区域订阅面（B-keystroke 预算） */
  const activeSession = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.sessions[s.activeThreadId]));
  const models = useStore(liveStore, (s) => s.models);
  const activeStats = useStore(liveStore, (s) => s.stats[s.activeThreadId ?? '']) ?? null;
  const sessionRules = useStore(liveStore, (s) => s.sessionRules);
  const hostPhase = useStore(liveStore, (s) => s.hostPhase);
  const commands = useStore(liveStore, (s) => s.commands);
  const effortLevels = useStore(liveStore, (s) => s.effortLevels);
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
  const agentsWorking = summarizeAgents(threadState?.agents ?? []).workingCount;
  const hostDown = hostPhase === null || hostPhase === 'failed';
  const permissionMode: PermissionRules['mode'] | null = sessionRules === null ? null : sessionRules.rules.mode;
  const permissionFollowsGlobal = sessionRules?.source !== 'thread';

  const selection = React.useMemo(
    () => composerSelectionOf(models, activeStats === null ? {} : { [activeThreadId]: activeStats }, activeSession, effortLevels),
    [models, activeStats, activeSession, effortLevels, activeThreadId],
  );

  const activeCwd = activeSession?.cwd ?? '';
  /** 分支视图拉取居留本区域；失效代次 = 新建任务页 checkout 成功（ui store branchRevision）。 */
  const gitBranches = useGitBranches(activeCwd, workspaceActions.listGitBranches, branchRevision);
  const branch = React.useMemo(
    () => branchSegmentOf(gitBranches.view, gitBranches.loading, gitBranches.failed),
    [gitBranches.view, gitBranches.loading, gitBranches.failed],
  );

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
        branch={{ ...branch, ariaLabel: copy.composer.branchSegment }}
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
            permissionFollowsGlobal={permissionFollowsGlobal}
            onSelectPermissionMode={(mode) => void workspaceActions.setSessionPermissionMode(mode)}
            onFollowPermissionGlobal={() => void workspaceActions.writeSessionRules(null)}
            agents={{ working: agentsWorking, onOpen: () => uiStore.getState().openAgentsPane() }}
            effort={{
              value: selection.effort,
              options: selection.effortOptions,
              onSelect: workspaceActions.selectEffort,
              unavailableLabel: copy.composer.effortUnavailable,
            }}
            usage={{ contextUsed: selection.contextUsed, stats: activeStats, label: copy.composer.contextUsage }}
          />
        )}
      />
    </div>
  );
}

const ComposerRegionMemo = React.memo(ComposerRegion);
export { ComposerRegionMemo as ComposerRegion };
