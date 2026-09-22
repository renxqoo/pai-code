import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '@paiapp/api';
import { foldThreadEvent } from '../fold-events';
import { initialThreadState } from '../live-thread-state';
import type { UiEvent } from '@paiapp/contracts';

/**
 * attempt 重开全链合测（用户症状：流式中断重试后同一消息出现两遍）：
 * 内核 runAttempt 在同 turn/step 内流失败重试——重发 phase:'start' 边界 + 从头
 * 的第二段 delta（llm/chunk 面无重开标记）。链路 = 真 mapper × 真 fold：
 * start 重置流缓冲 → streamRestarted → fold 清空当前流块 → 第二段从空重新累积。
 * 修复前形态：mapChunk 只认 (turn,step) 边界，两段 delta 叠加进同一块（A+A）。
 */

const T = 's1';
const NOW = 1_000;

type Frame = { threadId: string; name: string; payload: Record<string, unknown> };

const chunkFrame = (type: string, text: string): Frame => ({
  threadId: T,
  name: 'llm/chunk',
  payload: { turn: 1, step: 0, chunk: { type, text } },
});

const streamFrame = (phase: string, extra: Record<string, unknown> = {}): Frame => ({
  threadId: T,
  name: 'agent/assistant-stream',
  payload: { session: T, turn: 1, step: 0, frame: { phase, ...extra } },
});

describe('attempt 重开全链（mapper × fold）', () => {
  test('同 turn/step 两段流夹 start 边界：第二段替换第一段，thinking 同步清空，终态无叠加', () => {
    const mapper = createEventMapper({ now: () => NOW });
    let state = initialThreadState;
    const apply = (frame: Frame): void => {
      for (const event of mapper.mapEvent(frame as never) as UiEvent[]) {
        state = foldThreadEvent(state, event, NOW);
      }
    };

    apply({ threadId: T, name: 'turn/start', payload: { turn: 1, step: 0, time: 1 } });
    apply(chunkFrame('thinking-delta', '用户问的是渲染管线'));
    // 第一段：start → 部分正文 → attempt 失败
    apply(streamFrame('start'));
    apply(chunkFrame('text-delta', '收到「'));
    apply(chunkFrame('text-delta', '分析一下这'));
    apply(streamFrame('end', { kind: 'attempt' }));
    // 第二段：start（重开边界）→ 从头重发
    apply(streamFrame('start'));
    apply(chunkFrame('text-delta', '收到「'));
    apply(chunkFrame('text-delta', '分析一下这个」'));
    apply(chunkFrame('text-delta', '，开始分析。'));

    const turn = state.items.at(-1);
    expect(turn?.kind).toBe('turn');
    if (turn?.kind !== 'turn') return;
    const text = turn.turn.blocks.find((block) => block.kind === 'text');
    const thinking = turn.turn.blocks.find((block) => block.kind === 'thinking');
    // 修复前：'收到「分析一下这收到「分析一下这个」，开始分析。'（两段叠加）
    expect(text !== undefined && text.kind === 'text' ? text.text : '').toBe('收到「分析一下这个」，开始分析。');
    expect(thinking !== undefined && thinking.kind === 'thinking' ? thinking.text : '').toBe('');
    // 权威替换语义不受影响
    apply({
      threadId: T,
      name: 'assistant/message',
      payload: { turn: 1, step: 0, content: [{ type: 'text', text: '权威正文' }], thinking: '' },
    });
    const settled = state.items.at(-1);
    const settledText = settled?.kind === 'turn' ? settled.turn.blocks.find((block) => block.kind === 'text') : undefined;
    expect(settledText !== undefined && settledText.kind === 'text' ? settledText.text : '').toBe('权威正文');
  });

  test('无 start 边界的同段续流：append 语义不变（回归对照）', () => {
    const mapper = createEventMapper({ now: () => NOW });
    let state = initialThreadState;
    for (const frame of [
      { threadId: T, name: 'turn/start', payload: { turn: 1, step: 0, time: 1 } },
      chunkFrame('text-delta', '第一拍，'),
      chunkFrame('text-delta', '第二拍。'),
    ] as Frame[]) {
      for (const event of mapper.mapEvent(frame as never) as UiEvent[]) {
        state = foldThreadEvent(state, event, NOW);
      }
    }
    const turn = state.items.at(-1);
    const text = turn?.kind === 'turn' ? turn.turn.blocks.find((block) => block.kind === 'text') : undefined;
    expect(text !== undefined && text.kind === 'text' ? text.text : '').toBe('第一拍，第二拍。');
  });
});
