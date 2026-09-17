import { afterEach, describe, expect, jest, test } from 'bun:test';

import { controller, store, workspaceActions } from '@/live/workspace-runtime';
import { copy } from '@/strings';

/** forkFromEntry 失败文案分派：流式拒绝（thread is streaming）走「先停止再分叉」，其余走通用失败。 */

afterEach(() => {
  store.getState().reset();
  jest.restoreAllMocks();
});

describe('forkFromEntry 失败通知', () => {
  test('hub 错误含 thread is streaming：forkStreaming 文案（提示先停止会话再分叉）', async () => {
    jest.spyOn(controller, 'forkSession').mockResolvedValue({ ok: false, reason: 'fork rejected: thread is streaming' });
    expect(await workspaceActions.forkFromEntry('seq-3')).toBeNull();
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.forkStreaming]);
  });

  test('其他失败原因：通用 forkFailed 文案', async () => {
    jest.spyOn(controller, 'forkSession').mockResolvedValue({ ok: false, reason: 'entry_not_found' });
    expect(await workspaceActions.forkFromEntry('seq-3')).toBeNull();
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.forkFailed]);
  });

  test('条目 id 解析失败：不触 controller，forkFailed 文案', async () => {
    const fork = jest.spyOn(controller, 'forkSession');
    expect(await workspaceActions.forkFromEntry('not-a-seq')).toBeNull();
    expect(fork).not.toHaveBeenCalled();
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.forkFailed]);
  });
});
