import { describe, expect, test } from 'bun:test';

import { truncateAnchorSummary, turnAnchorSummary, turnAnchors } from '../turn-anchor-data';
import type { ThreadItem, TurnBlock, TurnModel } from '../thread-model';

function text(id: string, value: string): TurnBlock {
  return { kind: 'text', id, text: value };
}

function turnFixture(id: string, endedAt: number | null): TurnModel {
  return {
    id,
    status: endedAt === null ? 'running' : 'completed',
    startedAt: 0,
    endedAt,
    blocks: [text(`t-${id}`, `结论 ${id}`)],
  };
}

function turnItem(turn: TurnModel): ThreadItem {
  return { kind: 'turn', turn };
}

function messageItem(id: string): ThreadItem {
  return { kind: 'message', message: { id, role: 'user', text: '你好', images: [] } };
}

describe('turnAnchorSummary（历史轮锚点 tooltip 摘要）', () => {
  test('取最后一条非空文本块的首行，中间文本与思考不参与', () => {
    const turn = {
      blocks: [
        text('a', '先说明一下背景'),
        { kind: 'thinking', id: 'b', text: '推理过程' },
        text('c', '最终结论\n\n第二段补充'),
      ],
    };
    expect(turnAnchorSummary(turn)).toBe('最终结论');
  });

  test('最后一个文本块整块为空白时，回退到更早的非空文本块', () => {
    const turn = { blocks: [text('a', '有效回答'), text('b', '   \n  ')] };
    expect(turnAnchorSummary(turn)).toBe('有效回答');
  });

  test('首行内的连续空白折叠为单空格', () => {
    const turn = { blocks: [text('a', '  修复  了\t滚动  边界 \n后续行')] };
    expect(turnAnchorSummary(turn)).toBe('修复 了 滚动 边界');
  });

  test('无文本块 → 首个工具调用（名称 + 参数摘要）', () => {
    const turn = {
      blocks: [
        {
          kind: 'tools',
          id: 't',
          calls: [
            { id: 'c1', name: 'Bash', argsPreview: 'bun run lint', output: '', exitCode: 0, durationMs: 12, status: 'ok' },
            { id: 'c2', name: 'Read', argsPreview: 'src/a.ts', output: '', exitCode: 0, durationMs: 3, status: 'ok' },
          ],
        },
      ],
    };
    expect(turnAnchorSummary(turn)).toBe('Bash bun run lint');
  });

  test('异常终态轮 → 终态提示文本', () => {
    const turn = { blocks: [{ kind: 'turnFailure', id: 'f', stopReason: 'error', message: '401 invalid api key' }] };
    expect(turnAnchorSummary(turn)).toBe('401 invalid api key');
  });

  test('全部块缺失内容 → 降级空串（组件只展示时刻）', () => {
    expect(turnAnchorSummary({ blocks: [] })).toBe('');
    expect(turnAnchorSummary({ blocks: [text('a', '  ')] })).toBe('');
    expect(turnAnchorSummary({ blocks: [{ kind: 'thinking', id: 'b', text: '推理' }] })).toBe('');
  });

  test('症状回归：工具条目存在但名称与摘要全空白，继续向后降级而不是误报空行', () => {
    const turn = {
      blocks: [
        {
          kind: 'tools',
          id: 't',
          calls: [{ id: 'c1', name: '', argsPreview: ' ', output: '', exitCode: null, durationMs: null, status: 'running' }],
        },
        { kind: 'turnFailure', id: 'f', stopReason: 'aborted', message: null },
      ],
    };
    expect(turnAnchorSummary(turn)).toBe('');
  });
});

describe('truncateAnchorSummary（按码点截断）', () => {
  test('未超长原样返回；超长截断补省略号', () => {
    expect(truncateAnchorSummary('短文本', 10)).toBe('短文本');
    expect(truncateAnchorSummary('abcdefgh', 3)).toBe('abc…');
  });

  test('上限按码点计：emoji 不被劈开', () => {
    const emoji = '👍'.repeat(5);
    expect(truncateAnchorSummary(emoji, 3)).toBe('👍👍👍…');
    expect(Array.from(truncateAnchorSummary('a👍b👍c', 3))).toHaveLength(4);
  });

  test('垃圾上限降级为空串', () => {
    expect(truncateAnchorSummary('abc', 0)).toBe('');
    expect(truncateAnchorSummary('abc', Number.NaN)).toBe('');
  });
});

describe('turnAnchors（消息流 items → 锚点带数据）', () => {
  test('只保留已结束轮次：跳过消息项与 running 轮，顺序与消息流一致', () => {
    // 2026-09-07 10:46 / 15:05 local
    const items: ThreadItem[] = [
      messageItem('m1'),
      turnItem(turnFixture('t1', new Date(2026, 8, 7, 10, 46).getTime())),
      turnItem(turnFixture('t2', null)),
      messageItem('m2'),
      turnItem(turnFixture('t3', new Date(2026, 8, 7, 15, 5).getTime())),
    ];
    expect(turnAnchors(items).map((anchor) => anchor.id)).toEqual(['t1', 't3']);
  });

  test('锚点携带格式化时刻与轮次摘要', () => {
    const anchors = turnAnchors([turnItem(turnFixture('t1', new Date(2026, 8, 7, 10, 46).getTime()))]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.time).toBe('10:46 AM');
    expect(anchors[0]?.summary).toBe('结论 t1');
  });

  test('空消息流与全 running 轮次均降级为空数组', () => {
    expect(turnAnchors([])).toEqual([]);
    expect(turnAnchors([turnItem(turnFixture('t1', null))])).toEqual([]);
  });
});
