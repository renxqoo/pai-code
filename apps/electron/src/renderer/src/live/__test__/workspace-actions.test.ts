import { afterEach, describe, expect, jest, test } from 'bun:test';

import { controller, store, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { initialThreadState } from '@/live/live-thread-state';
import { copy } from '@/strings';

/** forkFromEntry 失败文案分派：流式拒绝（streaming_window）走「先停止再分叉」，其余走通用失败。 */

afterEach(() => {
  store.getState().reset();
  uiStore.getState().reset();
  jest.restoreAllMocks();
});

/** 排队单条操作（queue/drop、queue/send_now 的动作面寻址）：活跃线程 + 队列镜像夹具。 */
function seedQueue(): void {
  store.setState({
    activeThreadId: 't1',
    threads: {
      t1: {
        ...initialThreadState,
        queue: { steering: [], followUp: [{ id: 'q1', text: '排队的消息' }] },
      },
    },
  });
}

describe('排队消息单条操作', () => {
  test('移除：以活跃线程 + entryId 寻址 queue/drop；成功无通知', async () => {
    seedQueue();
    const drop = jest.spyOn(controller, 'queueDrop').mockResolvedValue('ok');
    workspaceActions.removeQueuedMessage('t1', 'q1');
    await Promise.resolve();
    expect(drop).toHaveBeenCalledWith('t1', 'q1');
    expect(store.getState().notices).toEqual([]);
  });

  test('移除撞已消费竞态（hub state_conflict）：queuedEntryConsumed 提示解释卡片未消失', async () => {
    seedQueue();
    jest.spyOn(controller, 'queueDrop').mockResolvedValue('consumed');
    workspaceActions.removeQueuedMessage('t1', 'q1');
    await Promise.resolve();
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.queuedEntryConsumed]);
  });

  test('编辑回填：移除成功后把条目文本写回草稿槽（空草稿直填）', async () => {
    seedQueue();
    jest.spyOn(controller, 'queueDrop').mockResolvedValue('ok');
    workspaceActions.editQueuedMessage('t1', 'q1');
    await Promise.resolve();
    expect(uiStore.getState().drafts.t1).toBe('排队的消息');
  });

  test('编辑回填：非空草稿追加（不覆盖在编内容）；移除失败不回填并提示', async () => {
    seedQueue();
    uiStore.getState().setDraft('t1', '正在写的内容');
    jest.spyOn(controller, 'queueDrop').mockResolvedValueOnce('ok');
    workspaceActions.editQueuedMessage('t1', 'q1');
    await Promise.resolve();
    expect(uiStore.getState().drafts.t1).toBe('正在写的内容\n排队的消息');

    jest.spyOn(controller, 'queueDrop').mockResolvedValueOnce('consumed');
    workspaceActions.editQueuedMessage('t1', 'q1');
    await Promise.resolve();
    expect(uiStore.getState().drafts.t1).toBe('正在写的内容\n排队的消息'); // 失败不追加
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.queuedEntryConsumed]);
  });

  test('立即改向失败（无运行中轮）：queuedSendNowUnavailable 提示，条目留在队列', async () => {
    seedQueue();
    jest.spyOn(controller, 'queueSendNow').mockResolvedValue('window');
    workspaceActions.sendQueuedMessageNow('t1', 'q1');
    await Promise.resolve();
    expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.queuedSendNowUnavailable]);
  });

  test('空 threadId 守卫不触 controller；纯图条目（空文本）编辑 = 仅移除不回填', async () => {
    const drop = jest.spyOn(controller, 'queueDrop').mockResolvedValue('ok');
    const sendNow = jest.spyOn(controller, 'queueSendNow').mockResolvedValue('ok');
    workspaceActions.removeQueuedMessage('', 'q1');
    workspaceActions.editQueuedMessage('', 'q1');
    workspaceActions.sendQueuedMessageNow('', 'q1');
    await Promise.resolve();
    expect(drop).not.toHaveBeenCalled();
    expect(sendNow).not.toHaveBeenCalled();

    // 空文本条目（纯图）：drop 成功但不写草稿（回填空串 = 无意义的裸换行）
    store.setState({
      activeThreadId: 't1',
      threads: { t1: { ...initialThreadState, queue: { steering: [], followUp: [{ id: 'q-img', text: '' }] } } },
    });
    jest.spyOn(controller, 'queueDrop').mockResolvedValueOnce('ok');
    uiStore.getState().setDraft('t1', '已有内容');
    workspaceActions.editQueuedMessage('t1', 'q-img');
    await Promise.resolve();
    expect(uiStore.getState().drafts.t1).toBe('已有内容');
  });
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

