import * as React from 'react';
import { useStore } from 'zustand';

import { normalizePermMode, type ModelInfoView, type QueueEntry } from '@x3code/contracts';

import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { copy } from '@/strings';
import { imagePayloadOf } from '@/composer/read-image-file';
import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { liveUsageOf } from '@/composer/usage-details';
import { composerSelectionOf } from '@/composer/composer-selection';
import {
  registerComposerTextarea,
  unregisterComposerTextarea,
} from '@/composer/composer-controller';
import { stopOrAbort } from '@/composer/stop-or-abort';
import { PromptCard, type ComposerAttachment } from '@/composer/prompt-card';
import { PromptInputArea } from '@/composer/prompt-input-area';
import { QueuedMessageCard } from '@/composer/queued-message-card';
import { ConfirmRequestBar } from '@/composer/confirm-request-bar';
import { dialogsOfThread } from '@/dialogs/dialogs-of-thread';
import { summarizeAgents } from '@/thread/panel-summary';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/** 排队列表的空态恒定引用（hub 队列镜像的 followUp 条目；后台线程排队不进本区域订阅面）。 */
const EMPTY_QUEUED: readonly QueueEntry[] = [];

/**
 * 线程页输入卡区域（T33 M2 / T34 M2，0 props）：live/ui store 自订阅 →
 * 组装子件（子件 props 契约不动）；提交 = 一行 api 动词
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
  // 实时占用/窗口（事件流派生）：每 step 一条 assistant/message 推进，无需拉取
  const activeLiveUsage = useStore(liveStore, (s) => s.threads[s.activeThreadId ?? '']?.liveUsage ?? null);
  const activeComposition = useStore(liveStore, (s) => s.analytics[s.activeThreadId ?? ''] ?? null);
  const sessionPermissionMode = useStore(liveStore, (s) => s.sessionPermissionMode);
  const hostPhase = useStore(liveStore, (s) => s.hostPhase);
  const commands = useStore(liveStore, (s) => s.commands);
  const thinkingLevel = useStore(liveStore, (s) => s.thinkingLevel);
  const threadState = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]));
  const composerDraft = useStore(uiStore, (s) => s.composerDraft);
  const drafts = useStore(uiStore, (s) => s.drafts);
  const composerRestore = useStore(uiStore, (s) => s.composerRestore);
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
  /** 发送同线程闸（ref，同步结算）：连按 Enter 去重防双投（异步在途时 state 闭包仍为
   *  旧值，必须用 ref 拦）；投递不再呈 loading——乐观回显即上屏，受理在后台。 */
  const sendingRef = React.useRef<Set<string>>(new Set());

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
      <PromptCard
        className="relative z-[1]"
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
            usage={{
              live: liveUsageOf(activeLiveUsage, windowOfModel(models, activeSession?.model ?? null)),
              cache: activeLiveUsage !== null ? { read: activeLiveUsage.cacheRead, input: activeLiveUsage.input } : null,
              composition: activeComposition,
              label: copy.composer.usageSummary,
            }}
          />
        )}
      />
    </div>
  );
}

/** 当前拨号模型在目录里的上下文窗口（分母的唯一来源）。
 *  窗口是「模型」的本体属性，不是会话运行时的观测——故随目录（get_models）下发、
 *  按拨号查表，而非从会话事件里挖（后者对 resume/parked 会话拿不到：request/context
 *  只在拨号变化时落账，重开历史会话不会再发该事件）。
 *  目录未声明（或拨号未知）→ null：展示层按无分母不渲染百分比。
 *  拆分约定与 groupModelOptions 同源：首个 '/' 前为 provider、其后为 modelId。 */
function windowOfModel(models: readonly ModelInfoView[], dial: string | null): number | null {
  if (dial === null || dial.length === 0) return null;
  const slash = dial.indexOf('/');
  const provider = slash === -1 ? '' : dial.slice(0, slash);
  const modelId = slash === -1 ? dial : dial.slice(slash + 1);
  const hit = models.find((m) => m.provider === provider && m.modelId === modelId);
  return hit?.contextWindow ?? null;
}

const ComposerRegionMemo = React.memo(ComposerRegion);
export { ComposerRegionMemo as ComposerRegion };
