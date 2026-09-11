import { describe, expect, test } from 'bun:test';

import { mergeSpanBlocks } from '../merge-turn-blocks';
import type { ToolCallModel, TurnBlock } from '@/thread/thread-model';

/** 尾 span 合入幂等并集（T35 M2a）：同 id 保 live、tools 按 callId 并集、diff 恒尾。 */

function call(id: string, overrides: Partial<ToolCallModel> = {}): ToolCallModel {
  return { id, name: 'bash', argsPreview: '', subagents: [], output: '', exitCode: null, durationMs: null, status: 'running', ...overrides };
}

const text = (id: string, value: string): TurnBlock => ({ kind: 'text', id, text: value });
const thinking = (id: string, value: string): TurnBlock => ({ kind: 'thinking', id, text: value });
const tools = (id: string, calls: ToolCallModel[]): TurnBlock => ({ kind: 'tools', id, calls });
const diff = (id: string, files: Array<{ path: string; additions: number; deletions: number }>): TurnBlock => ({
  kind: 'diff',
  id,
  diff: {
    changedFiles: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    files,
  },
});

describe('mergeSpanBlocks（尾 span 合入在途轮）', () => {
  test('空 span 原样返回（不复制语义之外的东西）', () => {
    const live = [text('text-7', '后半')];
    expect(mergeSpanBlocks(live, [])).toEqual(live);
  });

  test('不同 id 的块插到 live 内容之前（转写恒早于事件流已到达的内容）', () => {
    const merged = mergeSpanBlocks([text('text-9', '后半')], [text('text-3', '前半')]);
    expect(merged.map((block) => (block.kind === 'text' ? block.text : ''))).toEqual(['前半', '后半']);
  });

  test('同 id 正文按 append-only 合并（live 是较新后缀时取 live；互不为前后缀时拼接；幂等）', () => {
    const live = [text('text-9', '后半')];
    // 同内容幂等
    expect(mergeSpanBlocks(live, [text('text-9', '后半')])).toEqual(live);
    // 转写是 live 的后缀（转写更新）→ 取转写
    expect(mergeSpanBlocks(live, [text('text-9', '前面后半')]).map((block) => (block.kind === 'text' ? block.text : ''))).toEqual(['前面后半']);
    // 互不为前后缀（两条路径各自流式）→ 转写前缀 + live 后缀拼接，不丢任何一侧
    expect(mergeSpanBlocks(live, [text('text-9', '权威前半')]).map((block) => (block.kind === 'text' ? block.text : ''))).toEqual(['权威前半后半']);
  });

  test('工具调用按 callId 并集：live 已有的调用整体保留（不被转写的空输出砸成完成态）', () => {
    const live = [tools('tools-9', [call('c1', { status: 'running', output: '部分输出' })])];
    const span = [tools('tools-9', [call('c1', { status: 'ok', output: '', exitCode: 0 })])];
    const [block] = mergeSpanBlocks(live, span);
    const merged = block?.kind === 'tools' ? block.calls : [];
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe('running');
    expect(merged[0]?.output).toBe('部分输出');
  });

  test('live 不认识的 callId 从转写补入（已结束调用只有转写有结果）', () => {
    const live = [tools('tools-9', [call('c2')])];
    const span = [tools('tools-9', [call('c1', { status: 'ok', output: '结果', exitCode: 0 })])];
    const [block] = mergeSpanBlocks(live, span);
    const merged = block?.kind === 'tools' ? block.calls.map((item) => item.id) : [];
    expect(merged).toEqual(['c2', 'c1']);
  });

  test('thinking 块与 text 块各自独立并集（不互相顶替，保持转写内的块序）', () => {
    const merged = mergeSpanBlocks(
      [text('text-9', '后半'), thinking('think-9', '后半想')],
      [thinking('think-3', '前半想'), text('text-3', '前半')],
    );
    expect(merged.map((block) => block.id)).toEqual(['think-3', 'text-3', 'text-9', 'think-9']);
  });

  test('diff 恒挂轮末：span 的文件并入 live 的 diff（同 path 取转写值）', () => {
    const live = [text('text-9', '后半'), diff('diff-9', [{ path: 'a.ts', additions: 1, deletions: 1 }])];
    const span = [diff('diff-3', [{ path: 'a.ts', additions: 5, deletions: 2 }, { path: 'b.ts', additions: 1, deletions: 0 }])];
    const merged = mergeSpanBlocks(live, span);
    const last = merged[merged.length - 1];
    expect(last?.kind).toBe('diff');
    if (last?.kind !== 'diff') return;
    expect(last.diff.files).toEqual([
      { path: 'a.ts', additions: 5, deletions: 2 },
      { path: 'b.ts', additions: 1, deletions: 0 },
    ]);
    expect(last.diff.additions).toBe(6);
    expect(merged.slice(0, -1).map((block) => block.id)).toEqual(['text-9']);
  });

  test('live 无 diff 而 span 有：diff 仍挂轮末', () => {
    const merged = mergeSpanBlocks([text('text-9', '后半')], [diff('diff-3', [{ path: 'a.ts', additions: 1, deletions: 0 }])]);
    expect(merged.map((block) => block.kind)).toEqual(['text', 'diff']);
  });

  test('重复合入结果不变（幂等：刷新 + 补挂重定基两次对账）', () => {
    const live = [tools('tools-9', [call('c2', { status: 'running' })]), text('text-9', '后半')];
    const span = [thinking('think-3', '前半'), tools('tools-3', [call('c1', { status: 'ok' })]), diff('diff-3', [{ path: 'a.ts', additions: 1, deletions: 0 }])];
    const once = mergeSpanBlocks(live, span);
    expect(mergeSpanBlocks(once, span)).toEqual(once);
  });
});
