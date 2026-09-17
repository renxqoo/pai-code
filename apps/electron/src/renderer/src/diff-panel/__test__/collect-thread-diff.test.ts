import { describe, expect, test } from 'bun:test';

import { collectThreadDiff } from '../collect-thread-diff';
import type { ThreadModel, TurnModel } from '@/thread/thread-model';

function turn(id: string, blocks: TurnModel['blocks']): { kind: 'turn'; turn: TurnModel } {
  return { kind: 'turn', turn: { id, status: 'completed', startedAt: 0, endedAt: 1, blocks, streamingThinkingBlockId: null } };
}

function message(id: string): { kind: 'message'; message: { id: string; role: 'user'; text: string; images: [] } } {
  return { kind: 'message', message: { id, role: 'user', text: 'hi', images: [] } };
}

function diffBlock(id: string, files: { path: string; additions: number; deletions: number }[]) {
  return {
    kind: 'diff' as const,
    id,
    diff: {
      changedFiles: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      files,
    },
  };
}

describe('collectThreadDiff', () => {
  test('跨轮次聚合同路径文件的增删，保留首现顺序', () => {
    const thread: ThreadModel = {
      sessionId: 's',
      items: [
        message('m1'),
        turn('t1', [diffBlock('d1', [{ path: 'a.ts', additions: 10, deletions: 2 }, { path: 'b.ts', additions: 1, deletions: 0 }])]),
        turn('t2', [diffBlock('d2', [{ path: 'a.ts', additions: 5, deletions: 3 }])]),
      ],
      agents: [],
    };
    expect(collectThreadDiff(thread)).toEqual({
      changedFiles: 2,
      additions: 16,
      deletions: 5,
      files: [
        { path: 'a.ts', additions: 15, deletions: 5 },
        { path: 'b.ts', additions: 1, deletions: 0 },
      ],
    });
  });

  test('无 diff 块时返回空形态（0 文件，不崩溃）', () => {
    const thread: ThreadModel = {
      sessionId: 's',
      items: [message('m1'), turn('t1', [{ kind: 'text', id: 'x', text: 'plain' }])],
      agents: [],
    };
    expect(collectThreadDiff(thread)).toEqual({ changedFiles: 0, additions: 0, deletions: 0, files: [] });
  });
});
