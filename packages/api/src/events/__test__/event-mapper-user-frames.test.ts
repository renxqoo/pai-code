import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '../event-mapper';
import type { EventMapper } from '../event-mapper';

type Frame = Parameters<EventMapper['mapEvent']>[0];

function frame(name: string, payload: Record<string, unknown>): Frame {
  return { threadId: 't', name, payload };
}

describe('user/message（用户气泡直通——事件帧上屏不等对账）', () => {
  const mapper = createEventMapper({ now: () => 1_000 });
  const ENVELOPE = ['<snapshot kind="agent-types">', 'This snapshot supersedes earlier snapshots of this kind.', 'body', '</snapshot>'].join('\n');
  const SUMMARY = ['<goals>', '- goal-a', '</goals>', '', 'The message above is an automatic continuation summary generated mid-task. Continue the current work directly. Do not recap the summary to the user and do not ask for confirmation.'].join('\n');

  test.each([
    ['text 块载荷 → userMessage（origin 缺省回退 user）', { seq: 7, turn: 3, step: 0, content: [{ type: 'text', text: '你好' }] }, [{ type: 'userMessage', threadId: 't', message: { seq: 7, text: '你好', origin: 'user', images: [] } }]],
    // 多 text 块合并帧（内核 appendUserBatch 同批 claim 物化）：携带 userBlocks=输入条数
    ['双 text 块合并帧 → userBlocks: 2（乐观回显按条数认领）', { seq: 8337, turn: 33, step: 50, content: [{ type: 'text', text: '甲' }, { type: 'text', text: '乙' }] }, [{ type: 'userMessage', threadId: 't', message: { seq: 8337, text: '甲\n乙', origin: 'user', images: [], userBlocks: 2 } }]],
    // claimedIds 透传（内核 user 标记条目；有 claimedIds 时不再携带 userBlocks——身份优先于计数）
    ['携带 claimedIds 的帧 → 透传 id 列表（精准配对面）', { seq: 9001, turn: 5, step: 3, content: [{ type: 'text', text: '消息二' }], claimedIds: ['entry-m2'] }, [{ type: 'userMessage', threadId: 't', message: { seq: 9001, text: '消息二', origin: 'user', images: [], claimedIds: ['entry-m2'] } }]],
    ['origin=system；多 text 块换行拼接；图片块随帧携带（不再丢弃）', { seq: 9, turn: 1, step: 2, origin: 'system', content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'aGk=', mediaType: 'image/png' }, { type: 'text', text: 'b' }] }, [{ type: 'userMessage', threadId: 't', message: { seq: 9, text: 'a\nb', origin: 'system', images: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }] } }]],
    ['空文本（纯图）→ 丢弃（不产空气泡）', { seq: 1, turn: 0, step: 0, content: [{ type: 'image', data: 'x' }] }, []],
    ['垃圾载荷 → 丢弃', {}, []],
    // 帧缺 WAL seq（非条目派生）不发气泡：身份不能与条目对账同域，宁缺勿造永不重复的键
    ['缺 seq → 丢弃（身份无从与条目同域）', { turn: 3, step: 0, content: [{ type: 'text', text: '你好' }] }, []],
    ['子会话帧（payload.session ≠ threadId）不进主时间线', { session: 'child-s', seq: 2, turn: 0, step: 0, content: [{ type: 'text', text: 'hi' }] }, []],
    // 症状回归「注入快照当用户消息上屏」：尾部快照信封帧整帧跳过（谓词与 entries-mapper 同源）。
    // 帧携 surfaceOp=append（host 桥与 get_entries 条目投影同形）——谓词四重合取之一。
    ['内核快照信封帧 → 整帧跳过', { seq: 4, surfaceOp: 'append', turn: 0, step: 0, content: [{ type: 'text', text: ENVELOPE }] }, []],
    // 症状回归「直执行命令双渲染」：bash 信封帧侧不出气泡（条目侧折为工具块）
    ['直执行 bash 信封 → 整帧跳过（工具块由条目侧承载）', { seq: 6, turn: 0, step: 0, content: [{ type: 'text', text: '[bash] $ ls\nfile-a' }] }, []],
    // 非 append 的同形载荷不是快照（replace 型是压缩摘要）；症状回归
    // 「发一条消息出现两条相同气泡（摘要帧误领乐观回显）」：replace 型 = 压缩摘要
    // 落账，非用户发言，整帧跳过（与条目侧 isReplaceOp 同判据）。
    ['信封形态但 surfaceOp=replace → 整帧跳过（压缩摘要载体，非用户发言）', { seq: 5, surfaceOp: { op: 'replace', startSeq: 0, endSeq: 4 }, turn: 0, step: 0, content: [{ type: 'text', text: ENVELOPE }] }, []],
    // 症状锚定（2026-10-03 WAL seq 13246/13247）：autocompact L2 续跑摘要（<goals> 全文）
    // 以 replace 型 user/message 落账，曾直通成用户气泡并误领乐观回显队首
    ['压缩摘要 replace 帧（无信封形态）→ 整帧跳过', { seq: 13246, surfaceOp: { op: 'replace', startSeq: 10, endSeq: 103 }, turn: 1, step: 0, content: [{ type: 'text', text: SUMMARY }] }, []],
  ])('%s', (_label, payload, expected) => {
    expect(mapper.mapEvent(frame('user/message', payload as Record<string, unknown>))).toEqual(expected);
  });
});

describe('git/changed（hub 自产帧——外部 checkout 失效信号）', () => {
  const mapper = createEventMapper({ now: () => 1_000 });

  test.each([
    ['payload {cwd, branch} → gitChanged', { cwd: '/w/repo', branch: 'feat/x' }, [{ type: 'gitChanged', threadId: 't', cwd: '/w/repo', branch: 'feat/x' }]],
    ['branch 键缺席（detached）→ 无 branch 键', { cwd: '/w/repo' }, [{ type: 'gitChanged', threadId: 't', cwd: '/w/repo' }]],
    ['cwd 缺失（垃圾帧）→ 丢弃', {}, []],
    ['cwd 空 → 丢弃', { cwd: '', branch: 'x' }, []],
  ])('%s', (_label, payload, expected) => {
    expect(mapper.mapEvent(frame('git/changed', payload))).toEqual(expected);
  });
});
