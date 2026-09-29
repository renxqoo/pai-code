/**
 * 用户 worktree 建树通告投递（SESSION-WORKTREE-WORKFLOW §1.3）：来源会话 live 才投
 * thread/notify（idle 投 next-turn 排队不唤醒），其余形态零注入；投递结果三态
 * busy/idle/deferred 单值回调给装配层（pai:event worktreeNotice 事件的唯一产地）。
 * busy 判定与投递同点（来源表项 streaming 位），渲染层不做二次猜测。
 */

/** [git-worktree] 通告文本模板（§1.3 钉死模板——入口价值全押在此文案上）。 */
export function worktreeNoticeText(tree: { branch: string; path: string; cwd: string }): string {
  return `[git-worktree] branch ${tree.branch} is now checked out at ${tree.path} for this task.\nSubsequent file operations for this task should use that directory as the working root; do not modify the main worktree at ${tree.cwd}.`;
}

export type WorktreeNoticeKind = 'busy' | 'idle' | 'deferred';

/** hub 应答最小面（HubResult 结构兼容：成功带 data，失败不窥 error 字段）。 */
export type WorktreeNoticeResult = { ok: true; data: unknown } | { ok: false };

/** thread/list 表项（投递判定只需要这四字段；坏行在消费处降级跳过）。 */
export type WorktreeNoticeThreadRow = {
  threadId: string
  cwd: string
  state: string
  streaming?: boolean
};

export type WorktreeNoticeDeps = {
  /** thread/list（null = hub 不可用）。 */
  listThreads: () => Promise<WorktreeNoticeResult | null>
  /** thread/notify（应答 ok:false 或抛拒 = 未投递）。 */
  notify: (input: { threadId: string; source: string; kind: 'content'; text: string }) => Promise<WorktreeNoticeResult | null>
  /** 投递成功才登记 threadId → 树路径（派生树 chip 数据源）。 */
  registerSessionTree: (threadId: string) => void
  emit: (kind: WorktreeNoticeKind) => void
};

function rowsOf(data: unknown): readonly WorktreeNoticeThreadRow[] {
  const threads = (data as { threads?: unknown } | null)?.threads;
  if (!Array.isArray(threads)) return [];
  return threads.filter((row): row is WorktreeNoticeThreadRow => {
    const candidate = row as Partial<WorktreeNoticeThreadRow> | null;
    return (
      candidate !== null &&
      typeof candidate.threadId === 'string' &&
      typeof candidate.cwd === 'string' &&
      typeof candidate.state === 'string'
    );
  });
}

/**
 * 投递通告并回调结果：来源会话 live 且 cwd 与树的主仓一致 → notify → 登记 + busy/idle；
 * 任何一步不可投递（表项缺席/非 live/cwd 不符/命令失败）→ deferred（如实降级，不谎报已送达）。
 * fire-and-forget：调用方（create 完成钩子）不等投递结果。
 */
export function deliverWorktreeNotice(
  tree: { branch: string; path: string; cwd: string },
  sourceThreadId: string,
  deps: WorktreeNoticeDeps,
): void {
  void (async (): Promise<void> => {
    const listed = await deps.listThreads().catch(() => null);
    if (listed === null || !listed.ok) {
      deps.emit('deferred');
      return;
    }
    const row = rowsOf(listed.data).find((entry) => entry.threadId === sourceThreadId);
    if (row?.state !== 'live' || row?.cwd !== tree.cwd) {
      deps.emit('deferred');
      return;
    }
    const busy = row.streaming === true;
    const notified = await deps
      .notify({ threadId: sourceThreadId, source: 'git-worktree', kind: 'content', text: worktreeNoticeText(tree) })
      .catch(() => null);
    if (notified?.ok !== true) {
      deps.emit('deferred');
      return;
    }
    deps.registerSessionTree(sourceThreadId);
    deps.emit(busy ? 'busy' : 'idle');
  })();
}
