import type { HistoryItem } from '@paiapp/contracts';
import type { ThreadItem, TurnModel, TurnBlock, ToolCallModel } from '@/thread/thread-model';

/**
 * HistoryItem[] → ThreadItem[]（转写真相 → 视图）。
 * 分组语义：两个用户消息之间的全部 assistant/bash 条目折叠为一个轮次；
 * bash 条目独立成单工具轮次。条目 id 参与生成稳定视图 id（对账去重依赖）。
 * 轮次计时：startedAt 锚定触发本组的 user 条目时刻（即 prompt 提交时刻，覆盖模型响应延迟），
 * 无前置 user 条目回退首条 assistant 时刻；锚点即用即弃，不跨无关条目沿用。
 */

const MAX_TURN_BLOCK_CHARS = 4 * 1024 * 1024;

export function hydrateItems(history: readonly HistoryItem[], turnStartAt: number | null = null): readonly ThreadItem[] {
  const items: ThreadItem[] = [];
  let pending: { assistants: HistoryItem[] } | null = null;
  // 触发当前 pending 组的 user 条目时刻；flushTurn 消费后清空
  let anchor: number | null = turnStartAt;

  const flushTurn = (): void => {
    if (pending === null) return;
    const assistants = pending.assistants;
    pending = null;
    const startAt = anchor;
    anchor = null;
    if (assistants.length === 0) return;
    const first = assistants[0];
    const last = assistants[assistants.length - 1];
    if (first === undefined || last === undefined) return;
    const blocks = [...buildTurnBlocks(assistants)];
    // 轮次末异常终态（上游报错/中止）：无论有无正文都追加可见提示；
    // 真正无内容且正常结束的空 assistant 才不产生轮次
    const failure = failureOf(assistants);
    if (failure !== null) blocks.push(failure);
    if (blocks.length === 0) return;
    const turn: TurnModel = {
      id: `turn-${first.id}`,
      status: failure?.stopReason === 'aborted' ? 'stopped' : 'completed',
      startedAt: startAt ?? (first.kind === 'assistant' ? first.at : 0),
      endedAt: last.kind === 'assistant' ? last.at : 0,
      blocks,
      streamingThinkingBlockId: null,
    };
    items.push({ kind: 'turn', turn });
  };

  for (const item of history) {
    if (item.kind === 'user') {
      flushTurn();
      items.push({
        kind: 'message',
        message: {
          id: `msg-${item.id}`,
          role: item.origin === 'system' ? 'system' : 'user',
          text: clip(item.text),
          images: item.images.map(({ data, mediaType }) => ({ data, mimeType: mediaType })),
        },
      });
      anchor = item.at;
      continue;
    }
    if (item.kind === 'bash') {
      flushTurn();
      anchor = null;
      const call: ToolCallModel = {
        id: `call-${item.id}`,
        name: 'bash',
        argsPreview: item.command,
        subagents: [],
        output: item.output,
        exitCode: item.exitCode,
        durationMs: null,
        status: item.cancelled ? 'stopped' : item.exitCode === 0 ? 'ok' : 'failed',
      };
      const turn: TurnModel = {
        id: `turn-${item.id}`,
        status: 'completed',
        startedAt: item.at,
        endedAt: item.at,
        blocks: [{ kind: 'tools', id: `tools-${item.id}`, calls: [call] }],
        streamingThinkingBlockId: null,
      };
      items.push({ kind: 'turn', turn });
      continue;
    }
    pending ??= { assistants: [] };
    pending.assistants.push(item);
  }
  flushTurn();
  return items;
}

/** 追加条目（对账）：按条目 id 去重后转换（保持到达序）。 */
export function hydrateNewItems(history: readonly HistoryItem[]): readonly { item: ThreadItem; entryIds: readonly string[] }[] {
  const out: Array<{ item: ThreadItem; entryIds: readonly string[] }> = [];
  // 与 hydrateItems 同一分组语义，但需要保留组内条目 id 供去重；
  // 组内不含 user 条目，计时锚点（前置 user 条目时刻）由外层跨组传递
  let group: HistoryItem[] = [];
  let groupIds: string[] = [];
  let anchor: number | null = null;

  const flush = (): void => {
    if (group.length === 0) {
      groupIds = [];
      return;
    }
    const startAt = anchor;
    anchor = null;
    const converted = hydrateItems(group, startAt);
    const turn = converted[0];
    if (turn !== undefined) out.push({ item: turn, entryIds: groupIds });
    group = [];
    groupIds = [];
  };

  for (const entry of history) {
    if (entry.kind === 'user') {
      flush();
      const converted = hydrateItems([entry]);
      const message = converted[0];
      if (message !== undefined) out.push({ item: message, entryIds: [entry.id] });
      anchor = entry.at;
      continue;
    }
    if (entry.kind === 'bash') {
      flush();
      anchor = null;
      const converted = hydrateItems([entry]);
      const turn = converted[0];
      if (turn !== undefined) out.push({ item: turn, entryIds: [entry.id] });
      continue;
    }
    group.push(entry);
    groupIds.push(entry.id);
  }
  flush();
  return out;
}

/** 轮次末异常终态：取组内最后一个 assistant 条目的异常 stopReason（正常 stop/toolUse/垃圾值 → null）。 */
function failureOf(assistants: readonly HistoryItem[]): Extract<TurnBlock, { kind: 'turnFailure' }> | null {
  for (let index = assistants.length - 1; index >= 0; index -= 1) {
    const item = assistants[index];
    if (item?.kind !== 'assistant') continue;
    if (item.stopReason !== 'error' && item.stopReason !== 'aborted') return null;
    return { kind: 'turnFailure', id: `fail-${item.id}`, stopReason: item.stopReason, message: item.errorMessage };
  }
  return null;
}

/**
 * 块身份 = 消息身份（T35）：assistant 条目的 `messageTs` 与事件流侧 messageId 同源
 * （`String(message.timestamp)`，后者本就充当 live 侧的消息身份——delta/messageFinal/
 * 工具补齐都按它寻址），因此「同一条消息」在转写/在途快照/增量流三处恒为同一块 id，
 * 合并天然幂等、双渲染不可能。
 *
 * **不得再加组内序号后缀**：live 侧不知道自己是组内第几条，一旦转写侧带后缀，同一消息
 * 在两侧就永不命中同一 key（同轮双渲染）。同毫秒碰撞不表示两条不同消息——消息时间戳
 * 作为消息身份是既有前提（live 折叠全程依赖它）。
 * `messageTs === 0`（legacy 条目缺 message.timestamp）退回条目 id（两侧都会退化，可接受）。
 */
function blockKeyOf(item: Extract<HistoryItem, { kind: 'assistant' }>): string {
  return item.messageTs > 0 ? String(item.messageTs) : item.id;
}

function buildTurnBlocks(assistants: readonly HistoryItem[]): readonly TurnBlock[] {
  const blocks: TurnBlock[] = [];
  const diffFiles: Array<{ path: string; additions: number; deletions: number }> = [];
  for (const item of assistants) {
    if (item.kind !== 'assistant') continue;
    const key = blockKeyOf(item);
    if (item.thinking.length > 0) {
      blocks.push({ kind: 'thinking', id: `think-${key}`, text: clip(item.thinking) });
    }
    if (item.text.length > 0) {
      blocks.push({ kind: 'text', id: `text-${key}`, text: clip(item.text) });
    }
    if (item.toolCalls.length > 0) {
      const calls: ToolCallModel[] = item.toolCalls.map((call) => ({
        id: call.id,
        name: call.name,
        argsPreview: call.argsPreview,
        subagents: call.subagents ?? [],
        output: clip(call.output),
        exitCode: call.isError ? 1 : 0,
        durationMs: null,
        status: call.isError ? 'failed' : 'ok',
      }));
      blocks.push({ kind: 'tools', id: `tools-${key}`, calls });
      for (const call of item.toolCalls) {
        for (const file of call.diff ?? []) {
          mergeDiffFile(diffFiles, file.path, file.additions, file.deletions);
        }
      }
    }
  }
  if (diffFiles.length > 0) {
    const changedFiles = diffFiles.length;
    const additions = diffFiles.reduce((sum, file) => sum + file.additions, 0);
    const deletions = diffFiles.reduce((sum, file) => sum + file.deletions, 0);
    const first = assistants[0];
    blocks.push({
      kind: 'diff',
      id: `diff-${first?.kind === 'assistant' ? blockKeyOf(first) : 'x'}`,
      diff: { changedFiles, additions, deletions, files: diffFiles },
    });
  }
  return blocks;
}

export function mergeDiffFile(
  files: Array<{ path: string; additions: number; deletions: number }>,
  path: string,
  additions: number,
  deletions: number,
): void {
  const existing = files.find((file) => file.path === path);
  if (existing === undefined) {
    files.push({ path, additions, deletions });
    return;
  }
  existing.additions = additions;
  existing.deletions = deletions;
}

function clip(text: string): string {
  return text.length > MAX_TURN_BLOCK_CHARS ? text.slice(0, MAX_TURN_BLOCK_CHARS) : text;
}
