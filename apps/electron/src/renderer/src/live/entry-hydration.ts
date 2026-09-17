import type { PendingDialogView } from '@paiapp/contracts';

import type { BridgeClient } from './client-invoke';
import type { ReadPorts } from './read-ports';
import type { LiveThreadState } from './live-thread-state';
import type { LiveStore } from './store';

/**
 * 会话条目水化的三条拉取路径（controller 内编排使用）：
 * reconcile 增量对账（在途按 thread 去重）、rebuild 轮末重建（since 缺省全量；
 * 传轮首游标即轮内窗口重建——根治配对丢失的语义不变，长会话不再每轮 O(全量)）、
 * initial 冷启动全量。失败一律标记 hydrate/failed（转写落盘后的重建窗口由调用方守卫）。
 */
export function createEntryHydration(input: {
  client: BridgeClient;
  store: LiveStore;
  reconciling: Set<string>;
  isDisposed: () => boolean;
}) {
  const { client, store, reconciling, isDisposed } = input;

  const fetchEntries = async (threadId: string, since: number | null, dropLiveTurn: boolean): Promise<void> => {
    if (reconciling.has(`${threadId}:${dropLiveTurn}`)) return;
    reconciling.add(`${threadId}:${dropLiveTurn}`);
    try {
      const outcome = await client.invoke('session/entries', { threadId, since: since ?? undefined });
      if (isDisposed()) return;
      if (!outcome.ok) {
        // 游标失效由主进程兜底全量重拉；此处失败则标记（settle 后保留装饰态）
        store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
        return;
      }
      store.getState().hydrate(threadId, { kind: 'hydrate/reconcile', items: outcome.data.items, cursor: outcome.data.cursor, dropLiveTurn });
    } finally {
      reconciling.delete(`${threadId}:${dropLiveTurn}`);
    }
  };

  /**
   * 转写重建：since 空 = 全量整表 rebuild；轮内窗口（since=轮首游标）=
   * reconcile+dropLiveTurn（保历史前缀、权威替换本轮 span）。
   * opts.liveTurnPresent：轮仍在流式（直执行 bash 与模型轮并发等）——在途
   * 内容未落盘、不进任何载荷，整表/拆轮都会吞掉已流出增量，一律降级为
   * 不拆轮的 reconcile；opts.staleGuard：await 期间代际已翻（续轮在流式）
   * 则弃用迟到载荷。
   */
  const rebuildFromTranscript = async (
    threadId: string,
    since: number | null = null,
    opts: { liveTurnPresent?: () => boolean; staleGuard?: () => boolean } = {},
  ): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId, since: since ?? undefined });

    if (isDisposed()) return;
    if (opts.staleGuard?.()) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    const preserveLive = opts.liveTurnPresent?.() ?? false;
    if (since === null && !preserveLive) {
      store.getState().hydrate(threadId, { kind: 'hydrate/rebuild', items: outcome.data.items, cursor: outcome.data.cursor });
      return;
    }
    store.getState().hydrate(threadId, {
      kind: 'hydrate/reconcile',
      items: outcome.data.items,
      cursor: outcome.data.cursor,
      dropLiveTurn: !preserveLive,
    });
  };

  const hydrateFull = async (threadId: string): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId });
    if (isDisposed()) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    store.getState().hydrate(threadId, { kind: 'hydrate/initial', items: outcome.data.items, cursor: outcome.data.cursor });
  };

  return { fetchEntries, rebuildFromTranscript, hydrateFull };
}

/**
 * 只读水化链（T27/T28）：parked 会话先纳管（session/register，host 本地零 worker、
 * 幂等）再拉条目并补 model 元数据。纳管对 legacy（<v3）/超大/外部改写文件失败时
 * 回落 resume（唯一自愈路径：迁移文件/换行替换——写路径唤醒是必要代价）；
 * 文件缺失类失败交 hydrate/failed（可重试）面。在途按线程去重，force 供重试入口。
 */
export function createReadonlyHydration(input: {
  client: BridgeClient;
  store: LiveStore;
  ports: ReadPorts;
  resumeByPath: (sessionPath: string) => Promise<string | null>;
  activate: (threadId: string) => void;
  isDisposed: () => boolean;
  /** 待答弹窗重建后的兜底：宿主侧超时默认拒绝无回执帧，客户端仍需 5 分钟兜底收起
   * （重载重建的弹窗与事件到达的弹窗同口径，否则会永久滞留）。 */
  onDialogsHydrated: (dialogs: readonly PendingDialogView[]) => void;
  /** 在途快照落地后的钩子（直执行 bash 仍在跑 → 排收尾探测：协议无终态帧）。 */
  onInflightApplied: (threadId: string, bashRunning: boolean) => void;
}) {
  const { client, store, ports, resumeByPath, activate, isDisposed, onDialogsHydrated, onInflightApplied } = input;
  const hydrating = new Map<string, Promise<void>>();

  /** 条目拉取：视图落在原 threadId（换轨后拉取目标为 resume 响应 id）。
   * mode=reconcile 用于 live 会话冷启动——整表 initial 会重置 thread 状态，
   * 抹掉重载后已折叠的流式增量；reconcile 只把未见过的前缀插到 live 轮之前。 */
  const pull = async (threadId: string, targetId: string, mode: 'initial' | 'reconcile' = 'initial'): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId: targetId });
    if (isDisposed()) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    if (mode === 'initial') {
      store.getState().hydrate(threadId, { kind: 'hydrate/initial', items: outcome.data.items, cursor: outcome.data.cursor });
      return;
    }
    store.getState().hydrate(threadId, { kind: 'hydrate/reconcile', items: outcome.data.items, cursor: outcome.data.cursor, dropLiveTurn: false });
  };

  /**
   * 收敛链（T35 M2b，读序规则）：**内存态读先、落盘读最后**。
   *
   * 顺序不是风格：worker 的落盘是「先发消息定形事件、再写会话文件」两步，
   * 若先读 entries 后读 inflight，「恰在两读之间落盘」的消息两边都拿不到；反序则
   * 后读的 entries 必然包含它。三个内存态读（在途/子代理/弹窗）可并行，但整批必须
   * 在 entries 之前完成。
   *
   * 只对 live 会话发起：读口探测不得打 parked（未知命令会经 passthrough 唤醒 worker）。
   */
  /**
   * 过期在途快照判定：**只有在读在途期间发生了结算**才算过期（响应反映的是结算前的轮，应用它会把
   * 已结算的轮重新点亮，随后 entries 读带回权威内容）。
   *
   * 注意「结算先于读发起」**不是**过期：host 的应答反映读取时刻的状态——那次读之后的轮要么已无
   * 在途面（空形态），要么是结算后新起的轮（当前真相）。此前把这种情况也判过期，导致刷新后
   * （会话历史里已有结算）当前轮的在途快照被整批丢弃，只剩刷新后的增量（用户现场：思考只剩碎片）。
   */
  const snapshotFresh = (threadId: string, settledBefore: number): boolean =>
    (store.getState().threads[threadId]?.turnsSettled ?? 0) === settledBefore;

  const converge = async (threadId: string, targetId: string): Promise<void> => {
    const now = Date.now();
    const settledBefore = store.getState().threads[threadId]?.turnsSettled ?? 0;
    const [inflight, subagents, dialogs, state] = await Promise.all([
      ports.inflight(targetId),
      ports.subagents(targetId),
      ports.pendingDialogs(targetId),
      ports.threadState(targetId),
    ]);
    if (isDisposed()) return;
    const applyInflightView = inflight !== null && snapshotFresh(threadId, settledBefore);
    if (applyInflightView && inflight !== null) {
      store.getState().hydrate(threadId, { kind: 'hydrate/inflight', view: inflight, at: now });
      onInflightApplied(threadId, inflight.bash !== null);
    }
    if (subagents !== null) store.getState().hydrateSubagents(threadId, subagents, now);
    if (dialogs !== null && dialogs.length > 0) {
      store.getState().hydrateDialogs(dialogs);
      onDialogsHydrated(dialogs);
    }
    if (state !== null) store.getState().applyEvent({ type: 'queueChanged', threadId, steering: state.queue.steering, followUp: state.queue.followUp }, now);
    await pull(threadId, targetId, 'reconcile');
    // 复拉兜底：轮在途、读口却是空在途面（既无消息也无工具/bash），且本地没建出该轮——
    // 只可能是「消息定形事件已发、条目未落盘」的两步窗口：这条消息两侧都缺，
    // 复拉一次 entries 把它从转写带回（窗口毫秒级，拉一次即闭合）。
    const turnRunningWithEmptyFace =
      inflight?.turnStartSeq != null && inflight.message === null && inflight.toolOutputs.length === 0 && inflight.bash === null;
    if (turnRunningWithEmptyFace && liveTurnBlockCount(store.getState().threads[threadId]) === 0) {
      await pull(threadId, targetId, 'reconcile');
    }
  };

  const run = async (threadId: string): Promise<void> => {
    const session = store.getState().sessions[threadId];
    if (session?.sessionPath == null) return;
    // live/dead 会话的冷启动水化（渲染层重载后 store 全新）：事件流只推增量、
    // 不重放历史，条目只能全量拉补。live 会话可能正处于流式（重载前事件流已
    // 折出在途轮）——走 reconcile 保住在途现场，并先走一轮读口收敛（在途内容
    // 只存在于宿主内存，事件流不重放）；parked 无现场走 initial。
    // 不走纳管（表项已在 hub）；重复调用由 hydrated 标志去重
    if (session.state !== 'parked') {
      if (session.state === 'live') {
        await converge(threadId, threadId);
        return;
      }
      await pull(threadId, threadId, 'initial');
      return;
    }
    const registered = await client.invoke('session/register', { sessionPath: session.sessionPath });
    if (isDisposed()) return;
    if (!registered.ok && /not readable|thread_id_mismatch/.test(registered.reason)) {
      const liveId = await resumeByPath(session.sessionPath);
      if (isDisposed()) return;
      if (liveId !== null) {
        if (liveId !== threadId && store.getState().activeThreadId === threadId) activate(liveId);
        await pull(threadId, liveId);
        return;
      }
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    if (!registered.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    await pull(threadId, threadId);
    // 直读 get_state 补 model 元数据（主进程 touchSession 落视图 + 推送；
    // 失败静默——注册表 model 缺省时控件本地推导兜底）
    void client.invoke('session/state', { threadId }).catch(() => undefined);
  };

  return {
    ensureHydrated(threadId: string, options?: { force?: boolean }): Promise<void> {
      // hydrated 标志判定（空会话 cursor 恒 null，不能以 cursor 判，否则切回即
      // 重水化抹掉在途现场）；force 供重试入口越过守卫（hydrate/failed 不动 hydrated）
      if (!options?.force && store.getState().threads[threadId]?.hydrated) return Promise.resolve();
      const inFlight = hydrating.get(threadId);
      if (inFlight !== undefined) return inFlight;
      const started = run(threadId).finally(() => {
        if (hydrating.get(threadId) === started) hydrating.delete(threadId);
      });
      hydrating.set(threadId, started);
      return started;
    },
  };
}

/** 本地在途轮的块数（复拉兜底的判据：轮在途却一无所有 = 踩到了两步落盘窗口）。 */
function liveTurnBlockCount(thread: LiveThreadState | undefined): number {
  const liveTurnId = thread?.liveTurnId ?? null;
  if (liveTurnId === null || thread === undefined) return 0;
  for (const item of thread.items) {
    if (item.kind === 'turn' && item.turn.id === liveTurnId) return item.turn.blocks.length;
  }
  return 0;
}
