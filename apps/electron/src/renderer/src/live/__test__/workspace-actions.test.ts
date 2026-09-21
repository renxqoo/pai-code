import { afterEach, describe, expect, jest, test } from 'bun:test';

import { controller, store, workspaceActions } from '@/live/workspace-runtime';
import { copy } from '@/strings';

/** forkFromEntry 失败文案分派：流式拒绝（streaming_window）走「先停止再分叉」，其余走通用失败。 */

afterEach(() => {
  store.getState().reset();
  jest.restoreAllMocks();
});

describe('forkFromEntry 失败通知', () => {
  test('hub 流式拒绝（streaming_window）：forkStreaming 文案（提示先停止会话再分叉）', async () => {
    jest.spyOn(controller, 'forkSession').mockResolvedValue({ ok: false, reason: 'streaming_window' });
    expect(await workspaceActions.forkFromEntry('seq-3')).toBeNull();
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.forkStreaming]);
  });

  test('其他失败原因：通用 forkFailed 文案', async () => {
    jest.spyOn(controller, 'forkSession').mockResolvedValue({ ok: false, reason: 'cursor_stale' });
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
  test('hub 能力门拒绝（capability_images）→ imagesDenied 文案', async () => {
    jest.spyOn(controller, 'submitDraft').mockResolvedValue('capability_images');
    expect(await workspaceActions.submitDraft('看图', [])).toBe('capability_images');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.imagesDenied]);
  });

  test('hub 量限拒绝（images_too_many）→ imagesTooMany 文案；其他 kind 原样透传', async () => {
    // 症状回归：旧 startsWith('too many images') 是死 matcher（hub 实串/现 kind 均不命中）——kind 判定后量限文案恢复生效
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('images_too_many');
    expect(await workspaceActions.submitDraft('图', [])).toBe('images_too_many');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.imagesTooMany]);
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('unknown_thread');
    expect(await workspaceActions.submitDraft('文', [])).toBe('unknown_thread');
    expect(store.getState().notices.at(-1)?.text).toBe(copy.flow.sendFailed('unknown_thread'));
  });

  test('transient face 全词表直达精准文案（含此前漏网的 command_failed），不透传 token 原文', async () => {
    // 症状回归（对抗审查）：旧手工 Set 漏 command_failed —— hub 回 success:false 缺 error
    // 载荷/未识别 infra 串都归入该 face，落 sendFailed 透传 token；词表判定与
    // transientFaceCopy 同源闭集后新增 face 不再漂移
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('command_failed');
    expect(await workspaceActions.submitDraft('文', [])).toBe('command_failed');
    expect(store.getState().notices.at(-1)?.text).toBe('命令执行失败，请重试。');
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('timeout');
    expect(await workspaceActions.submitDraft('文', [])).toBe('timeout');
    expect(store.getState().notices.at(-1)?.text).toBe('操作超时，请重试。');
  });

  test('空舞台投递（no_active_session）→ noActiveSession 可行动文案，不透传 schema 密文', async () => {
    jest.spyOn(controller, 'submitDraft').mockResolvedValueOnce('no_active_session');
    expect(await workspaceActions.submitDraft('写个脚本', [])).toBe('no_active_session');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.noActiveSession]);
  });
});

