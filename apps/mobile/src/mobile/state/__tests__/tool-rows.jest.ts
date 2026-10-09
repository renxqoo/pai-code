/**
 * 症状：打开有工具历史的会话，每次工具调用渲染两张卡——参数卡停在运行态，
 * 结果卡另起一行（桌面端 entries-mapper 把 call/result 并进同一条目）。
 */
import { describe, expect, it } from '@jest/globals';

import { mapEntriesResponse } from '../../relay/response-map';
import { createSessionSync } from '../session-sync';

function wal(seq: number, event: Record<string, unknown>): unknown {
  return { seq, ts: 1_700_000_000_000 + seq, event };
}

function entriesOf(lines: unknown[]): unknown {
  return { entries: lines, leafSeq: lines.length, hasMore: false };
}

describe('WAL 工具行投影（症状：一次工具调用渲染两张卡）', () => {
  it('call + result 折成一行：终态 + 输出 + 参数摘要齐全', () => {
    const result = mapEntriesResponse(
      entriesOf([
        wal(1, { type: 'tool/call', callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' }),
        wal(2, { type: 'tool/result', callId: 'c1', name: 'bash', content: 'a.txt\nb.txt', isError: false }),
      ]),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: 'tool', toolName: 'bash', status: 'ok', text: 'a.txt\nb.txt', argsPreview: '{"command":"ls"}' });
  });

  it('isError 结果落 failed 终态，不留运行态行', () => {
    const result = mapEntriesResponse(
      entriesOf([
        wal(1, { type: 'tool/call', callId: 'c1', name: 'bash', arguments: '{}' }),
        wal(2, { type: 'tool/result', callId: 'c1', name: 'bash', content: 'boom', isError: true }),
      ]),
    );
    expect(result.items.map((item) => item.status)).toEqual(['failed']);
  });

  it('不同 callId 各自成行，互不吞并', () => {
    const result = mapEntriesResponse(
      entriesOf([
        wal(1, { type: 'tool/call', callId: 'c1', name: 'read', arguments: '{}' }),
        wal(2, { type: 'tool/result', callId: 'c1', name: 'read', content: 'x' }),
        wal(3, { type: 'tool/call', callId: 'c2', name: 'write', arguments: '{}' }),
        wal(4, { type: 'tool/result', callId: 'c2', name: 'write', content: 'y' }),
      ]),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.text)).toEqual(['x', 'y']);
  });

  it('结果先于调用到达（跨窗口/乱序）仍收成一行终态', () => {
    const result = mapEntriesResponse(
      entriesOf([
        wal(1, { type: 'tool/result', callId: 'c1', name: 'bash', content: 'done' }),
        wal(2, { type: 'tool/call', callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' }),
      ]),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ status: 'ok', text: 'done', argsPreview: '{"command":"ls"}' });
  });

  it('批内无结果的调用保留运行态（交由运行期事件或 turnSettled 收敛）', () => {
    const result = mapEntriesResponse(entriesOf([wal(1, { type: 'tool/call', callId: 'c1', name: 'bash', arguments: '{}' })]));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe('running');
  });

  it('水化 id 落在 `tool-<callId>` 域，运行期 toolEnded 能收敛到它', () => {
    const hydrated = mapEntriesResponse(
      entriesOf([
        wal(1, { type: 'tool/call', callId: 'c9', name: 'bash', arguments: '{}' }),
        wal(2, { type: 'tool/result', callId: 'c9', name: 'bash', content: '' }),
      ]),
    );
    const sync = createSessionSync({ onDialogRequest: () => {}, onDialogSettled: () => {}, onSessionEvent: () => {} });
    sync.seed(hydrated.items);
    expect(sync.snapshot().messages[0]?.id).toBe('tool-c9');
  });
});

describe('运行期工具事件收敛水化行（症状：重放/补投的 toolEnded 无处落地）', () => {
  it('callId 索引缺失时按 id 域找到水化行并落终态', () => {
    const sync = createSessionSync({ onDialogRequest: () => {}, onDialogSettled: () => {}, onSessionEvent: () => {} });
    sync.seed([{ id: 'tool-c7', kind: 'tool', text: '', createdAt: '2026-01-01T00:00:00.000Z', status: 'running', toolName: 'bash', argsPreview: '{}' }]);
    sync.handleEvent({ type: 'toolEnded', callId: 'c7', output: 'late output', isError: false, durationMs: 12 });
    const row = sync.snapshot().messages[0];
    expect(row?.status).toBe('ok');
    expect(row?.text).toBe('late output');
    expect(row?.durationMs).toBe(12);
  });

  it('callId 缺失（垃圾事件）不改动任何行', () => {
    const sync = createSessionSync({ onDialogRequest: () => {}, onDialogSettled: () => {}, onSessionEvent: () => {} });
    sync.seed([{ id: 'tool-c7', kind: 'tool', text: '', createdAt: '2026-01-01T00:00:00.000Z', status: 'running', toolName: 'bash', argsPreview: '{}' }]);
    sync.handleEvent({ type: 'toolEnded', output: 'orphan' });
    expect(sync.snapshot().messages[0]?.status).toBe('running');
  });
});