import { describe, expect, test } from 'bun:test';

import { isSnapshotFrame } from '../snapshot-frame';

/** 内核 isSnapshotNode 四重合取的协议镜像负矩阵：任一合取项缺席即非快照帧。 */

const ENVELOPE = ['<snapshot kind="agent-types">', 'This snapshot supersedes earlier snapshots of this kind.', 'body', '</snapshot>'].join('\n');

describe('isSnapshotFrame（尾部快照信封谓词）', () => {
  test('四重合取齐备判定为快照帧（kind 任意）', () => {
    expect(isSnapshotFrame({ type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: ENVELOPE }] })).toBe(true);
    const date = ENVELOPE.replace('agent-types', 'date');
    expect(isSnapshotFrame({ type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: date }] })).toBe(true);
  });

  test('负矩阵：非 user/message / 无 surfaceOp / 多块 / 非 text 块 / 首行残缺 / 次行非作废声明', () => {
    expect(isSnapshotFrame({ type: 'assistant/message', surfaceOp: 'append', content: [{ type: 'text', text: ENVELOPE }] })).toBe(false);
    expect(isSnapshotFrame({ type: 'user/message', content: [{ type: 'text', text: ENVELOPE }] })).toBe(false);
    expect(isSnapshotFrame({ type: 'user/message', surfaceOp: 'replace', content: [{ type: 'text', text: ENVELOPE }] })).toBe(false);
    expect(isSnapshotFrame({ type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: ENVELOPE }, { type: 'text', text: 'x' }] })).toBe(false);
    expect(isSnapshotFrame({ type: 'user/message', surfaceOp: 'append', content: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }] })).toBe(false);
    expect(isSnapshotFrame({ type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: '<snapshot kind="agent-types">\nbody\n</snapshot>' }] })).toBe(false);
    expect(isSnapshotFrame({ type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: '<snapshot kind=agent-types>\nThis snapshot supersedes earlier snapshots of this kind.\nbody\n</snapshot>' }] })).toBe(false);
  });
});
