import { describe, expect, test } from 'bun:test';

import { foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { initialThreadState, type LiveThreadState } from '../live-thread-state';
import { mergeSpanBlocks } from '../merge-turn-blocks';
import type { InflightView, UiEvent } from '@paiapp/contracts';
import type { TurnBlock } from '@/thread/thread-model';

const ev = (event: UiEvent): Parameters<typeof foldThreadEvent>[1] =>
  ({ threadId: 't1', at: 1, event, seq: 1 }) as never;

function inflightView(partial: Partial<InflightView>): InflightView {
  return { turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null, ...partial };
}

const bash = (id: string) => ({ id, name: 'bash', argsPreview: 'ls' });
const edit = (id: string, path: string) => ({
  id,
  name: 'edit',
  argsPreview: path,
  editHunks: [{ oldText: 'a', newText: 'b', path }],
});

function toolBlocks(state: LiveThreadState): TurnBlock[] {
  const turn = state.items.find((item) => item.kind === 'turn' && item.turn.id === state.liveTurnId);
  return turn?.kind === 'turn' ? turn.turn.blocks.filter((block) => block.kind === 'tools') : [];
}

function toolCallIds(state: LiveThreadState): string[] {
  return toolBlocks(state).flatMap((block) => (block.kind === 'tools' ? block.calls.map((call) => call.id) : []));
}

describe('工具块身份用 callId 集合（对抗审查 P0-1：刷新落在工具执行中 → 双渲染）', () => {
  test('症状回归：inflight 快照与匿名增量落到同一批调用时只渲染一块', () => {
    let state: LiveThreadState = { ...initialThreadState, streaming: true };
    // 空 messageId 的增量先到（用户现场时序）→ 折出匿名 tools 块
    state = foldThreadEvent(state, ev({ type: 'toolCallAdded', messageId: '', call: bash('c1'), diff: null }), 1);
    // 读口快照后到（messageTs 与增量路径的 messageId 不同源：7 vs stream-N）
    state = foldHydrate(
      state,
      {
        kind: 'hydrate/inflight',
        view: inflightView({ turnStartSeq: 0, message: { messageTs: 7, text: '', thinking: '', toolCalls: [bash('c1')] } }),
      },
      2,
    );
    expect(toolCallIds(state)).toEqual(['c1']);
    expect(toolBlocks(state)).toHaveLength(1);
  });

  test('同一批多调用：块 id 由 callId 集合决定，与消息时间戳无关', () => {
    let state: LiveThreadState = { ...initialThreadState, streaming: true };
    state = foldHydrate(
      state,
      {
        kind: 'hydrate/inflight',
        view: inflightView({
          turnStartSeq: 0,
          message: { messageTs: 7, text: '', thinking: '', toolCalls: [bash('c1'), edit('c2', 'src/a.ts')] },
        }),
      },
      1,
    );
    // inflight 组必须带 editHunks（否则刷新后该组永远没有 diff 区）
    const calls = toolBlocks(state).flatMap((block) => (block.kind === 'tools' ? block.calls : []));
    expect(calls.map((call) => call.id)).toEqual(['c1', 'c2']);
    expect(calls[1]?.editHunks).toHaveLength(1);
  });

  test('无 callId 的退化快照：退回 messageTs 键，不崩不双渲染', () => {
    let state: LiveThreadState = { ...initialThreadState, streaming: true };
    state = foldHydrate(
      state,
      {
        kind: 'hydrate/inflight',
        view: inflightView({ turnStartSeq: 0, message: { messageTs: 7, text: '正文', thinking: '', toolCalls: [] } }),
      },
      1,
    );
    expect(state.items.some((item) => item.kind === 'turn')).toBe(true);
  });

  test('转写块 id 与 live 不同源、但 callId 重叠 → 并入同一块（不再双渲染）', () => {
    const call = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      name: 'bash',
      argsPreview: 'ls',
      subagents: [],
      editHunks: [],
      output: '',
      exitCode: 0,
      durationMs: 1,
      status: 'ok',
      ...over,
    });
    const live: TurnBlock[] = [{ kind: 'tools', id: 'tools-calls:c1', calls: [call('c1', { status: 'running' })] }];
    // 转写侧的块 id 完全不同源（WAL 行 ts），但含同一个 callId c1
    const span: TurnBlock[] = [{ kind: 'tools', id: 'tools-7', calls: [call('c1', { output: 'done' })] }];
    const merged = mergeSpanBlocks(live, span);
    const ids = merged.flatMap((block) => (block.kind === 'tools' ? block.calls.map((c) => c.id) : []));
    // c1 只有一个宿主块，不出现两份
    expect(ids.filter((id) => id === 'c1')).toHaveLength(1);
    expect(merged.filter((block) => block.kind === 'tools')).toHaveLength(1);
  });

  test('callId 无重叠时转写块仍正常并入（不误并）', () => {
    const call = (id: string) => ({
      id,
      name: 'bash',
      argsPreview: 'ls',
      subagents: [],
      editHunks: [],
      output: '',
      exitCode: 0,
      durationMs: 1,
      status: 'ok',
    });
    const live: TurnBlock[] = [{ kind: 'tools', id: 'tools-calls:c1', calls: [call('c1')] }];
    const span: TurnBlock[] = [{ kind: 'tools', id: 'tools-9', calls: [call('c2')] }];
    const merged = mergeSpanBlocks(live, span);
    const ids = merged.flatMap((block) => (block.kind === 'tools' ? block.calls.map((c) => c.id) : []));
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(['c1', 'c2']);
  });

  test('转写块与 live 块按 callId 并集，不按块 id（块 id 不同源时也能对齐）', () => {
    const live: TurnBlock[] = [{ kind: 'tools', id: 'tools-calls:c1', calls: [{ ...bash('c1'), name: 'bash', argsPreview: 'ls', subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 1, status: 'running' }] }];
    const span: TurnBlock[] = [
      { kind: 'tools', id: 'tools-7', calls: [{ ...bash('c1'), name: 'bash', argsPreview: 'ls', subagents: [], editHunks: [], output: 'done', exitCode: 0, durationMs: 1, status: 'ok' }] },
      { kind: 'tools', id: 'tools-7b', calls: [{ ...bash('c2'), name: 'bash', argsPreview: 'pwd', subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 1, status: 'ok' }] },
    ];
    const merged = mergeSpanBlocks(live, span);
    const calls = merged.flatMap((block) => (block.kind === 'tools' ? block.calls.map((call) => call.id) : []));
    // c1 只出现一次（live 保留），c2 从转写补入
    expect(calls.filter((id) => id === 'c1')).toHaveLength(1);
    expect(calls).toContain('c2');
  });
});
