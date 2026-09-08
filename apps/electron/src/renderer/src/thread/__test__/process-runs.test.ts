import { describe, expect, test } from 'bun:test';

import { processRuns } from '../process-runs';
import type { ToolCallModel } from '../thread-model';

function call(id: string): ToolCallModel {
  return { id, name: 'bash', argsPreview: 'echo hi', output: '', exitCode: 0, durationMs: 12, status: 'ok' };
}

describe('processRuns', () => {
  test('相邻思考/工具块聚合为一段过程组，正文是独立段；孤工具块也是单元素过程组', () => {
    const runs = processRuns([
      { kind: 'thinking', id: 't1', text: '先看现状' },
      { kind: 'tools', id: 'c1', calls: [call('a')] },
      { kind: 'text', id: 'x1', text: '说明' },
      { kind: 'tools', id: 'c2', calls: [call('b')] },
    ]);
    expect(runs).toEqual([
      {
        kind: 'process',
        blocks: [
          { kind: 'thinking', id: 't1', text: '先看现状' },
          { kind: 'tools', id: 'c1', calls: [call('a')] },
        ],
      },
      { kind: 'single', block: { kind: 'text', id: 'x1', text: '说明' } },
      { kind: 'process', blocks: [{ kind: 'tools', id: 'c2', calls: [call('b')] }] },
    ]);
  });

  test('被正文隔开的工具块不跨段合并（时间线在正文处断开）', () => {
    const runs = processRuns([
      { kind: 'tools', id: 'c1', calls: [call('a')] },
      { kind: 'text', id: 'x1', text: '中间说明' },
      { kind: 'tools', id: 'c2', calls: [call('b')] },
    ]);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toEqual({ kind: 'process', blocks: [{ kind: 'tools', id: 'c1', calls: [call('a')] }] });
    expect(runs[2]).toEqual({ kind: 'process', blocks: [{ kind: 'tools', id: 'c2', calls: [call('b')] }] });
  });

  test('空过程块（无文本思考/无调用工具块）不产生段', () => {
    const runs = processRuns([
      { kind: 'thinking', id: 't0', text: '' },
      { kind: 'tools', id: 'c0', calls: [] },
      { kind: 'text', id: 'x1', text: '正文' },
    ]);
    expect(runs).toEqual([{ kind: 'single', block: { kind: 'text', id: 'x1', text: '正文' } }]);
  });

  test('空块不打断相邻过程段：空工具块两侧的过程块仍进同一组', () => {
    const runs = processRuns([
      { kind: 'thinking', id: 't1', text: '推理' },
      { kind: 'tools', id: 'c0', calls: [] },
      { kind: 'tools', id: 'c1', calls: [call('a')] },
    ]);
    expect(runs).toEqual([
      {
        kind: 'process',
        blocks: [
          { kind: 'thinking', id: 't1', text: '推理' },
          { kind: 'tools', id: 'c1', calls: [call('a')] },
        ],
      },
    ]);
  });

  test('空列表 → 无段', () => {
    expect(processRuns([])).toEqual([]);
  });
});
