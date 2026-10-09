import { describe, expect, test } from 'bun:test';

import { itemTopMargin } from '../message-list';
import type { ThreadItem } from '../thread-model';

/**
 * 真机实测：用户气泡底 → 轮状态行「共工作 xx」顶 = 74px，太松。
 * 两个来源都要治：轮次顶距 48px，以及气泡下方那条 hover 才显形的操作栏
 * （opacity-0 但始终占位 ≈26px）。
 *
 * 判据是**归属**：用户气泡是「本轮的提问」，状态行是「本轮的回答」——
 * 两者同属一轮，间距应收；两轮之间才需要大间距分隔。
 */

const userMessage = (id: string): ThreadItem => ({
  kind: 'message',
  message: { id, role: 'user', text: '提问', images: [] },
});

const systemMessage = (id: string): ThreadItem => ({
  kind: 'message',
  message: { id, role: 'system', text: '系统注入', images: [] },
});

const turn = (id: string): ThreadItem => ({
  kind: 'turn',
  turn: {
    id,
    status: 'completed',
    startedAt: 0,
    endedAt: 1,
    blocks: [],
    streamingThinkingBlockId: null,
  },
});

describe('itemTopMargin：按归属给间距（用户提问与本轮状态行同属一轮，收）', () => {
  test('紧跟用户提问的轮：收紧（这是本轮的回答，不是新一轮的开始）', () => {
    expect(itemTopMargin(1, turn('t1'), userMessage('m1'))).toBe('pt-[16px]');
  });

  test('紧跟另一轮的轮：保持大间距（两轮之间要能看出断层）', () => {
    expect(itemTopMargin(2, turn('t2'), turn('t1'))).toBe('pt-[48px]');
  });

  test('系统注入消息不算提问：其后的轮仍按「与上一轮分隔」处理', () => {
    expect(itemTopMargin(1, turn('t1'), systemMessage('s1'))).toBe('pt-[48px]');
  });

  test('用户消息之间的间距不变', () => {
    expect(itemTopMargin(1, userMessage('m2'), userMessage('m1'))).toBe('pt-[20px]');
  });

  test('首项无上边距', () => {
    expect(itemTopMargin(0, turn('t1'), null)).toBe('');
    expect(itemTopMargin(0, userMessage('m1'), null)).toBe('');
  });

  test('缺前项时按「与上一轮分隔」兜底（不因数据缺口给出过小间距）', () => {
    expect(itemTopMargin(3, turn('t1'), null)).toBe('pt-[48px]');
  });
});
