import { describe, expect, test } from 'bun:test';

import { changedFileCount, isTurnRunning, turnElapsedMs, turnEndedAbnormally, visibleTurnBlocks } from '../turn-state';
import type { ToolCallStatus } from '@paiapp/contracts';
import type { TurnBlock } from '../thread-model';
import { turnTextContent } from '../turn-text';

describe('turnElapsedMs', () => {
  const startedAt = 1_000_000;

  test('运行中的轮走表，最小为 0', () => {
    expect(turnElapsedMs({ status: 'running', startedAt, endedAt: null }, startedAt + 76_000)).toBe(76_000);
    expect(turnElapsedMs({ status: 'running', startedAt, endedAt: null }, startedAt - 1)).toBe(0);
  });

  test('completed / stopped 冻结在 endedAt，忽略观察时刻', () => {
    const turn = { status: 'completed' as const, startedAt, endedAt: startedAt + 12_000 };
    expect(turnElapsedMs(turn, startedAt + 999_000)).toBe(12_000);
    const stopped = { status: 'stopped' as const, startedAt, endedAt: startedAt + 5_000 };
    expect(turnElapsedMs(stopped, startedAt + 999_000)).toBe(5_000);
  });

  test('垃圾输入降级为 0：endedAt 缺失、时间倒挂、非有限值', () => {
    expect(turnElapsedMs({ status: 'completed', startedAt, endedAt: null }, startedAt + 1)).toBe(0);
    expect(turnElapsedMs({ status: 'completed', startedAt, endedAt: startedAt - 100 }, startedAt)).toBe(0);
    expect(turnElapsedMs({ status: 'running', startedAt: Number.NaN, endedAt: null }, startedAt)).toBe(0);
  });
});

describe('isTurnRunning', () => {
  test('状态判别', () => {
    expect(isTurnRunning({ status: 'running' })).toBe(true);
    expect(isTurnRunning({ status: 'stopped' })).toBe(false);
  });
});

describe('visibleTurnBlocks（症状回归：过程整体收起只留最后一条文本输出）', () => {
  const blocks = [
    { kind: 'text' as const, id: 'a', text: '中间说明' },
    { kind: 'thinking' as const, id: 'b', text: '推理' },
    { kind: 'tools' as const, id: 'c', calls: [] },
    { kind: 'text' as const, id: 'd', text: '最终回答' },
  ];

  test('收起：过程（思考/工具/中间文本）整体隐藏，只保留最后一条文本', () => {
    expect(visibleTurnBlocks(blocks, false)).toEqual([{ kind: 'text', id: 'd', text: '最终回答' }]);
  });

  test('展开：全部块按原顺序可见', () => {
    expect(visibleTurnBlocks(blocks, true)).toBe(blocks);
  });

  test('收起时无文本块 → 空列表；只有一条文本时收起仍保留它', () => {
    expect(visibleTurnBlocks([{ kind: 'thinking', id: 'x', text: 't' }], false)).toEqual([]);
    const single = [{ kind: 'text' as const, id: 'only', text: '答' }];
    expect(visibleTurnBlocks(single, false)).toEqual(single);
  });

  test('症状回归：轮以工具收尾不得把工具前旁白当结果（只取最后一个 tools 块之后的文本）', () => {
    const narrationFirst = [
      { kind: 'text' as const, id: 'narration', text: '正在搭建项目' },
      { kind: 'tools' as const, id: 'calls', calls: [] },
      { kind: 'text' as const, id: 'result', text: '全部完成' },
    ];
    expect(visibleTurnBlocks(narrationFirst, false)).toEqual([{ kind: 'text', id: 'result', text: '全部完成' }]);
    // 工具收尾、无后续文本：不回退到工具前旁白
    const toolEnded = [
      { kind: 'text' as const, id: 'narration', text: '正在搭建项目' },
      { kind: 'tools' as const, id: 'calls', calls: [] },
    ];
    expect(visibleTurnBlocks(toolEnded, false)).toEqual([]);
  });

  test('症状回归：异常终态提示（报错/中止）收起时也可见，跟在最后一条文本之后', () => {
    const failure = { kind: 'turnFailure' as const, id: 'f', stopReason: 'error' as const, message: '401 invalid api key' };
    expect(visibleTurnBlocks([{ kind: 'text' as const, id: 'd', text: '最终回答' }, failure], false)).toEqual([
      { kind: 'text', id: 'd', text: '最终回答' },
      failure,
    ]);
    // 无文本的空失败轮：收起也不能把提示藏掉
    expect(visibleTurnBlocks([failure], false)).toEqual([failure]);
  });
});

describe('turnTextContent', () => {
  test('只取文本块并按空行拼接，供时间戳行的复制入口使用', () => {
    const turn = {
      blocks: [
        { kind: 'text' as const, id: 'a', text: '第一段' },
        { kind: 'tools' as const, id: 'b', calls: [] },
        { kind: 'text' as const, id: 'c', text: '第二段' },
      ],
    };
    expect(turnTextContent(turn)).toBe('第一段\n\n第二段');
  });

  test('无文本块时输出空字符串', () => {
    expect(turnTextContent({ blocks: [] })).toBe('');
  });
});

describe('turnEndedAbnormally（症状回归：异常结束的轮不折叠消息展示）', () => {
  const failure: TurnBlock = { kind: 'turnFailure', id: 'f', stopReason: 'error', message: 'boom' };
  const aborted: TurnBlock = { kind: 'turnFailure', id: 'f', stopReason: 'aborted', message: null };

  test('用户停止 / 回收打断（stopped）与轮末异常提示块（报错/中止）都算异常结束', () => {
    expect(turnEndedAbnormally({ status: 'stopped', blocks: [] })).toBe(true);
    expect(turnEndedAbnormally({ status: 'completed', blocks: [failure] })).toBe(true);
    expect(turnEndedAbnormally({ status: 'stopped', blocks: [aborted] })).toBe(true);
  });

  test('正常完成与运行中不算异常', () => {
    expect(turnEndedAbnormally({ status: 'completed', blocks: [{ kind: 'text', id: 't', text: 'done' }] })).toBe(false);
    expect(turnEndedAbnormally({ status: 'running', blocks: [failure] })).toBe(false);
  });
});

describe('changedFileCount 轮级变更摘要（Q3：收起时也得看得到动了哪些文件）', () => {
  const edit = (path: string, id: string, status: ToolCallStatus = 'ok') => ({
    id,
    name: 'edit',
    argsPreview: path,
    subagents: [],
    editHunks: [{ oldText: 'a', newText: 'b', path }],
    output: '',
    exitCode: 0,
    durationMs: 1,
    status,
  });

  test('成功改动的文件去重计数', () => {
    const blocks = [
      { id: 't1', kind: 'tools' as const, calls: [edit('a.ts', 'c1'), edit('a.ts', 'c2'), edit('b.ts', 'c3')] },
    ];
    expect(changedFileCount(blocks)).toBe(2);
  });

  test('只数成功调用：失败/运行中的编辑不算（没改成的东西不报）', () => {
    const blocks = [
      {
        id: 't1',
        kind: 'tools' as const,
        calls: [edit('a.ts', 'c1', 'failed'), edit('b.ts', 'c2', 'running')],
      },
    ];
    expect(changedFileCount(blocks)).toBeNull();
  });

  test('无编辑调用 / 空块 → null（无变更可报，不挂后缀）', () => {
    expect(changedFileCount([])).toBeNull();
    expect(changedFileCount([{ id: 't1', kind: 'tools' as const, calls: [] }])).toBeNull();
  });
});
