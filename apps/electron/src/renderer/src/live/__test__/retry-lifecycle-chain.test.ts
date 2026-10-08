import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '@paiapp/api';
import { foldThreadEvent } from '../fold-events';
import { initialThreadState } from '../live-thread-state';
import type { UiEvent } from '@paiapp/contracts';

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
type LiveRetry = { attempt: number; errorMessage: string } | null;

function chain(): { apply: (frame: Frame) => void; retrying: () => LiveRetry } {
  const mapper = createEventMapper({ now: () => NOW });
  let state = initialThreadState;
  return {
    apply: (frame: Frame): void => {
      for (const event of mapper.mapEvent(frame as never) as UiEvent[]) {
        state = foldThreadEvent(state, event, NOW);
      }
    },
    retrying: () => (state as { retrying: LiveRetry }).retrying,
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
  payload: { turn, step, retry: attempt, failure: { message: 'http-429: rate limited' } },
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
    expect(c.retrying()?.attempt).toBe(1);

    c.apply(stream(1, 0, 'start'));
    c.apply(chunk(1, 0, 'text-delta', '收到「分析一下这个」，开始分析。'));

    expect(c.retrying()).toBeNull();
  });

  test('重试再次失败：序号推进且横幅不提前熄灭（start 帧不是成功信号）', () => {
    const c = chain();
    c.apply(turnStart(2));
    c.apply(stream(2, 0, 'start'));
    c.apply(chunk(2, 0, 'text-delta', '收到'));
    c.apply(stream(2, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(2, 0, 1));

    c.apply(stream(2, 0, 'start'));
    c.apply(stream(2, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(2, 0, 2));

    expect(c.retrying()?.attempt).toBe(2);
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

    expect(c.retrying()).toBeNull();
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

    expect(c.retrying()).toBeNull();
  });

  test('失败 attempt 零 token（缓冲未开）：重试首个增量开新消息，横照常撤下', () => {
    const c = chain();
    c.apply(turnStart(5));
    c.apply(stream(5, 0, 'start'));
    c.apply(stream(5, 0, 'end', { kind: 'attempt' }));
    c.apply(llmRetry(5, 0, 1));

    c.apply(stream(5, 0, 'start'));
    c.apply(chunk(5, 0, 'text-delta', '好了'));

    expect(c.retrying()).toBeNull();
  });
});