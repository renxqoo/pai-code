import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '@x3code/api';
import { foldThreadEvent, hasRetryInFlight } from '../fold-events';
import { initialThreadState } from '../live-thread-state';
import type { TurnBlock } from '@/thread/thread-model';
import type { UiEvent } from '@x3code/contracts';

/**
 * 重试横幅生命周期全链合测（用户症状：重试已经跑通，「重试中（第 N 次）」横幅还挂着）。
 *
 * 协议事实：内核 llm-retry 判定重试后原地重发同一个 (turn, step)（attempt 循环顶部
 * 重发 phase:'start'）。线上唯一的新 attempt 信号就是它——缓冲已在时映射为
 * streamRestarted 而非 messageStarted；且它每次重派都发，包括紧接着又要失败的那次，
 * 因此它本身不携带「这次重试成功了」的信息。真正证明模型重新产出的，是被重试的
 * attempt 的任意产出：正文/思考增量、工具调用、或权威消息定形。
 */

const T = 's1';
const NOW = 1_000;

type Frame = { threadId: string; name: string; payload: Record<string, unknown> };
type RetryBlock = Extract<TurnBlock, { kind: 'retry' }>;

function chain(): { apply: (frame: Frame) => void; fold: (event: UiEvent) => void; retrying: () => boolean; retryBlocks: () => readonly RetryBlock[]; liveBlocks: () => readonly TurnBlock[] } {
  const mapper = createEventMapper({ now: () => NOW });
  let state = initialThreadState;
  const applyEvent = (event: UiEvent): void => {
    state = foldThreadEvent(state, event, NOW);
  };
  return {
    apply: (frame: Frame): void => {
      for (const event of mapper.mapEvent(frame as never) as UiEvent[]) applyEvent(event);
    },
    fold: applyEvent,
    retrying: () => hasRetryInFlight(state),
    retryBlocks: () => {
      const items = (state as { items: ReadonlyArray<{ kind: string; turn?: { blocks: readonly TurnBlock[] } }> }).items;
      const turn = items.findLast((item) => item.kind === 'turn');
      return (turn?.turn?.blocks ?? []).filter((block): block is RetryBlock => block.kind === 'retry');
    },
    liveBlocks: () => {
      const items = (state as { items: ReadonlyArray<{ kind: string; turn?: { blocks: readonly TurnBlock[] } }> }).items;
      const turn = items.findLast((item) => item.kind === 'turn');
      return turn?.turn?.blocks ?? [];
    },
  };
}

const turnStart = (turn: number, step = 0): Frame => ({ threadId: T, name: 'turn/start', payload: { turn, step, time: 1 } });

const stream = (turn: number, step: number, phase: string, extra: Record<string, unknown> = {}): Frame => ({
  threadId: T,
  name: 'agent/assistant-stream',
  payload: { session: T, turn, step, frame: { phase, ...extra } },
});

const chunk = (turn: number, step: number, type: 'text-delta' | 'thinking-delta', text: string): Frame => ({
  threadId: T,
  name: 'llm/chunk',
  payload: { turn, step, chunk: { type, text } },
});

const llmRetry = (turn: number, step: number, attempt: number): Frame => ({
  threadId: T,
  name: 'llm/retry',
  payload: { turn, step, retry: attempt, failure: { message: 'http-429: rate limited', code: 'http-429' } },
});

const toolCall = (turn: number, step: number, callId: string, name: string): Frame => ({
  threadId: T,
  name: 'tool/call',
  payload: { turn, step, callId, name, arguments: '{}' },
});

const assistantMessage = (turn: number, step: number, text: string): Frame => ({
  threadId: T,
  name: 'assistant/message',
  payload: { turn, step, content: [{ type: 'text', text }], thinking: '' },
});

describe('重试横幅生命周期（mapper × fold）', () => {
  test('症状回归：失败 attempt 已流出正文时，重试产出正文即撤下横幅', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(stream(1, 0, 'start'));
    c.apply(chunk(1, 0, 'thinking-delta', '用户在问渲染管线'));
    c.apply(chunk(1, 0, 'text-delta', '收到「'));
    c.apply(stream(1, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(1, 0, 1));
    expect(c.retrying()).toBe(true);

    c.apply(stream(1, 0, 'start'));
    c.apply(chunk(1, 0, 'text-delta', '收到「分析一下这个」，开始分析。'));

    expect(c.retrying()).toBe(false);
  });

  test('重试再次失败：序号推进且横幅不提前熄灭（start 帧不是成功信号）', () => {
    const c = chain();
    c.apply(turnStart(2));
    c.apply(stream(2, 0, 'start'));
    c.apply(chunk(2, 0, 'text-delta', '收到'));
    c.apply(stream(2, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(2, 0, 1));
    expect(c.retrying()).toBe(true);

    c.apply(stream(2, 0, 'start'));
    // start 帧到达的瞬间横幅不得熄灭：它每次重派都发（含紧接着又要失败的那次），
    // 不携带成败信息——此处断言是本用例的判别核心，缺失时清除面回归到 streamRestarted
    // 全套件仍绿
    expect(c.retrying()).toBe(true);
    c.apply(stream(2, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(2, 0, 2));

    const blocks = c.retryBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.attempt).toBe(2);
  });

  test('重试成功但只出工具调用（无文本增量）：工具调用即撤下横幅', () => {
    const c = chain();
    c.apply(turnStart(3));
    c.apply(stream(3, 0, 'start'));
    c.apply(chunk(3, 0, 'text-delta', '我看下文件'));
    c.apply(stream(3, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(3, 0, 1));

    c.apply(stream(3, 0, 'start'));
    c.apply(toolCall(3, 0, 'c1', 'read'));

    expect(c.retrying()).toBe(false);
  });

  test('重试成功但整条消息无正文：权威 message 定形即撤下横幅', () => {
    const c = chain();
    c.apply(turnStart(4));
    c.apply(stream(4, 0, 'start'));
    c.apply(chunk(4, 0, 'text-delta', '中断的半句'));
    c.apply(stream(4, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(4, 0, 1));

    c.apply(stream(4, 0, 'start'));
    c.apply(assistantMessage(4, 0, ''));

    expect(c.retrying()).toBe(false);
  });

  test('失败 attempt 零 token（缓冲未开）：重试首个增量开新消息，横照常撤下', () => {
    const c = chain();
    c.apply(turnStart(5));
    c.apply(stream(5, 0, 'start'));
    c.apply(stream(5, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(5, 0, 1));

    c.apply(stream(5, 0, 'start'));
    c.apply(chunk(5, 0, 'text-delta', '好了'));

    expect(c.retrying()).toBe(false);
  });
});

describe('重试行块（对话列内联展示）', () => {
  test('重试发生时 live 轮落 retry 块：位置在失败正文之后、diff 尾块之前', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(chunk(1, 0, 'text-delta', '收到'));
    c.apply(toolCall(1, 0, 'c1', 'write'));
    // diff 尾块：fold 层在 toolEnded 消费变更视图（mapper 结果侧无 patch 面，
    // 直接注 UiEvent 验证块序不变式）
    c.fold({ type: 'toolEnded', threadId: T, callId: 'c1', output: 'ok', isError: false, durationMs: 0, diff: [{ path: 'a.ts', additions: 2, deletions: 0 }] });
    c.apply(stream(1, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(1, 0, 1));

    const blocks = c.retryBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ attempt: 1, code: 'http-429', message: 'http-429: rate limited' });
    const all = c.liveBlocks();
    const retryAt = all.findIndex((block) => block.kind === 'retry');
    const diffAt = all.findIndex((block) => block.kind === 'diff');
    const textAt = all.findIndex((block) => block.kind === 'text');
    expect(textAt).toBeGreaterThanOrEqual(0);
    expect(diffAt).toBeGreaterThanOrEqual(0);
    expect(retryAt).toBeGreaterThan(textAt);
    expect(retryAt).toBeLessThan(diffAt);
    // 轮末仍是 diff（尾部不变式未被 retry 插入破坏）
    expect(all[all.length - 1]?.kind).toBe('diff');
  });

  test('同一 attempt 连续重试：块原地更新序号与文案，不叠第二块', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(chunk(1, 0, 'text-delta', '收到'));
    c.apply(llmRetry(1, 0, 1));
    c.apply(llmRetry(1, 0, 2));
    c.apply(llmRetry(1, 0, 3));

    const blocks = c.retryBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.attempt).toBe(3);
  });

  test('重试恢复（模型产出）后 retry 块消失', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(chunk(1, 0, 'text-delta', '收到'));
    c.apply(llmRetry(1, 0, 1));
    expect(c.retryBlocks()).toHaveLength(1);

    c.apply(chunk(1, 0, 'text-delta', '，继续'));

    expect(c.retryBlocks()).toHaveLength(0);
    expect(c.retrying()).toBe(false);
  });

  test('轮结算后 retry 块不残留（transient：成功的历史轮不带重试行）', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(chunk(1, 0, 'text-delta', '收到'));
    c.apply(llmRetry(1, 0, 1));
    c.apply(chunk(1, 0, 'text-delta', '，继续'));
    c.apply({ threadId: T, name: 'settled', payload: { ok: true } });

    expect(c.retryBlocks()).toHaveLength(0);
  });

  test('重试失败到底（重试耗尽直接结算）：结算后不留 retry 块', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(chunk(1, 0, 'text-delta', '收到'));
    c.apply(llmRetry(1, 0, 1));
    c.apply({ threadId: T, name: 'settled', payload: { ok: false, reason: 'gave up' } });

    expect(c.retryBlocks()).toHaveLength(0);
    expect(c.retrying()).toBe(false);
  });

  test('worker 死亡冻结轮次：retry 块不残留（死轮不得钉住旋转的重试行）', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(chunk(1, 0, 'text-delta', '收到'));
    c.apply(llmRetry(1, 0, 1));
    expect(c.retryBlocks()).toHaveLength(1);

    // sessionDied 由主进程从 thread_died 帧合成（mapper 不产）——直接折 UiEvent
    c.fold({ type: 'sessionDied', threadId: T, reason: 'worker_crash' });

    expect(c.retryBlocks()).toHaveLength(0);
    expect(c.retrying()).toBe(false);
  });

  test('结算后迟到的重试帧不点亮已冻结轮（错序泄漏帧不残留）', () => {
    const c = chain();
    c.apply(turnStart(1));
    c.apply(chunk(1, 0, 'text-delta', '收到'));
    c.apply({ threadId: T, name: 'settled', payload: { ok: true } });
    c.apply(llmRetry(1, 0, 1));

    expect(c.retryBlocks()).toHaveLength(0);
    expect(c.retrying()).toBe(false);
  });
});