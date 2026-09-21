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

describe('提交失败通知（D15：images 硬拒的友好文案）', () => {
  test('hub 能力门拒绝（model does not accept images）→ imagesDenied 文案', async () => {
    jest.spyOn(controller, 'submitDraft').mockResolvedValue('invalid images: model does not accept images');
    expect(await workspaceActions.submitDraft('看图', [])).toBe('invalid images: model does not accept images');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.imagesDenied]);
  });

  test('hub 量限拒绝（too many images）→ imagesTooMany 文案；其他 reason 原样透传', async () => {
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('too many images (max 8)');
    expect(await workspaceActions.submitDraft('图', [])).toBe('too many images (max 8)');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.imagesTooMany]);
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('Unknown threadId');
    expect(await workspaceActions.submitDraft('文', [])).toBe('Unknown threadId');
    expect(store.getState().notices.at(-1)?.text).toBe(copy.flow.sendFailed('Unknown threadId'));
  });

  test('空舞台投递（no_active_session）→ noActiveSession 可行动文案，不透传 schema 密文', async () => {
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('no_active_session');
    expect(await workspaceActions.submitDraft('写个脚本', [])).toBe('no_active_session');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.noActiveSession]);
  });
});

