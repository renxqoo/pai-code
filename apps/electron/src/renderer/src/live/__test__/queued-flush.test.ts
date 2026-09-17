import { afterEach, describe, expect, test } from 'bun:test';

import type { SessionView, UiEvent } from '@paiapp/contracts';
import { createLiveStore } from '../store';
import { connectQueuedDraftFlush } from '../queued-flush';
import { queuedDrafts, type QueuedDraft } from '@/composer/queued-drafts';

/** 连接器绑定应用级暂存单例：每个用例自清，防跨用例串扰。 */
const usedThreads = new Set<string>();
function stage(threadId: string, sessionPath: string | null, text: string): void {
  usedThreads.add(threadId);
  queuedDrafts.stage(threadId, sessionPath, text, []);
}
afterEach(() => {
  for (const threadId of usedThreads) queuedDrafts.dropThread(threadId);
  usedThreads.clear();
});

const session = (threadId: string, sessionPath: string | null, streaming = false): SessionView => ({
  threadId,
  cwd: '/w',
  sessionPath,
  title: 'T',
  state: 'live',
  streaming,
  model: null,
  thinkingLevel: null,
  lastActivityAt: 1,
});

type SubmitLog = { threadId: string; text: string; mode: 'steer' | 'followUp' }[];

/** 等待冲刷串行链排空（链为微任务驱动，宏任务一拍兜底）。 */
function drain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 0);
  });
}

function setup(): { log: SubmitLog; drive: (event: UiEvent, at?: number) => void; disconnect: () => void } {
  const store = createLiveStore();
  const log: SubmitLog = [];
  const disconnect = connectQueuedDraftFlush(store, (threadId, draft: QueuedDraft, mode) => {
    log.push({ threadId, text: draft.text, mode });
    return Promise.resolve(null);
  });
  return {
    log,
    disconnect,
    drive: (event, at = 1) => store.getState().applyEvent(event, at),
  };
}

describe('queued-flush 连接器', () => {
  test('自然结算：暂存按序 followUp 冲刷并清空', async () => {
    const { log, drive, disconnect } = setup();
    stage('t1', '/w/a.jsonl', '好了吗');
    stage('t1', '/w/a.jsonl', '再来一句');
    drive({ type: 'sessionUpdated', session: session('t1', '/w/a.jsonl') });
    drive({ type: 'turnStarted', threadId: 't1', at: 1 });
    drive({ type: 'turnSettled', threadId: 't1', ok: true, usage: null }, 2);
    await drain();
    expect(log).toEqual([
      { threadId: 't1', text: '好了吗', mode: 'followUp' },
      { threadId: 't1', text: '再来一句', mode: 'followUp' },
    ]);
    expect(queuedDrafts.snapshot().t1).toBeUndefined();
    disconnect();
  });

  test('用户停止的结算不冲刷（卡片保留由用户处置）', async () => {
    const store = createLiveStore();
    const log: SubmitLog = [];
    const disconnect = connectQueuedDraftFlush(store, (threadId, draft, mode) => {
      log.push({ threadId, text: draft.text, mode });
      return Promise.resolve(null);
    });
    stage('t1', '/w/a.jsonl', '排队消息');
    store.getState().applyEvent({ type: 'sessionUpdated', session: session('t1', '/w/a.jsonl') }, 1);
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
    store.getState().stopIntent('t1');
    store.getState().applyEvent({ type: 'turnSettled', threadId: 't1', ok: true, usage: null }, 2);
    await drain();
    expect(log).toEqual([]);
    expect(queuedDrafts.snapshot().t1?.map((draft) => draft.text)).toEqual(['排队消息']);
    disconnect();
  });

  test('worker 死亡（sessionDied）结算不冲刷', async () => {
    const { log, drive, disconnect } = setup();
    stage('t1', '/w/a.jsonl', '排队消息');
    drive({ type: 'sessionUpdated', session: session('t1', '/w/a.jsonl') });
    drive({ type: 'turnStarted', threadId: 't1', at: 1 });
    drive({ type: 'sessionDied', threadId: 't1', reason: 'exit' }, 2);
    await drain();
    expect(log).toEqual([]);
    expect((queuedDrafts.snapshot().t1 ?? []).length).toBe(1);
    disconnect();
  });

  test('fork 换轨（旧线程 parkThread 终态）不冲刷：不得向已被 hub 移除的旧 id 投递', async () => {
    const store = createLiveStore();
    const log: SubmitLog = [];
    const disconnect = connectQueuedDraftFlush(store, (threadId, draft, mode) => {
      log.push({ threadId, text: draft.text, mode });
      return Promise.resolve(null);
    });
    stage('t1', '/w/a.jsonl', '生成中排队的消息');
    store.getState().applyEvent({ type: 'sessionUpdated', session: session('t1', '/w/a.jsonl') }, 1);
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
    // fork 成功：旧线程镜像终态化 + 会话行转 parked（sessionPath 保留旧文件）
    store.getState().parkThread('t1');
    store.getState().applyEvent({ type: 'sessionUpdated', session: { ...session('t1', '/w/a.jsonl'), state: 'parked' } }, 2);
    await drain();
    expect(log).toEqual([]);
    // 卡片保留在旧 path 下：待用户从 History 重开旧会话文件时按路径改绑接续
    expect(queuedDrafts.snapshot().t1?.map((draft) => draft.text)).toEqual(['生成中排队的消息']);
    disconnect();
  });

  test('重开换 id：移除间隙暂存保留（已落盘即宿主），新会话注册后改绑并立即冲刷', async () => {
    const store = createLiveStore();
    const log: SubmitLog = [];
    const disconnect = connectQueuedDraftFlush(store, (threadId, draft, mode) => {
      log.push({ threadId, text: draft.text, mode });
      return Promise.resolve(null);
    });
    stage('t1', '/w/a.jsonl', '跨重开的排队');
    store.getState().applyEvent({ type: 'sessionUpdated', session: session('t1', '/w/a.jsonl') }, 1);
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
    // 本生命周期新建会话从未进 saved 目录：移除间隙无任何宿主记录也保留（文件在盘即证据）
    store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 2);
    expect((queuedDrafts.snapshot().t1 ?? []).length).toBe(1);
    // 新线程注册（resume 换 id）→ 改绑 + 空闲接续投递
    store.getState().applyEvent({ type: 'sessionUpdated', session: session('t2', '/w/a.jsonl') }, 3);
    await drain();
    expect(log).toEqual([{ threadId: 't2', text: '跨重开的排队', mode: 'followUp' }]);
    expect(queuedDrafts.snapshot().t1).toBeUndefined();
    expect(queuedDrafts.snapshot().t2).toBeUndefined();
    disconnect();
  });

  test('宿主重启：崩溃保留卡片随 parked 重注册只改绑不投递，resume 换 live id 后接续冲刷', async () => {
    const store = createLiveStore();
    const log: SubmitLog = [];
    const disconnect = connectQueuedDraftFlush(store, (threadId, draft, mode) => {
      log.push({ threadId, text: draft.text, mode });
      return Promise.resolve(null);
    });
    stage('t1', '/w/a.jsonl', '崩溃时排队的消息');
    store.getState().applyEvent({ type: 'sessionUpdated', session: session('t1', '/w/a.jsonl') }, 1);
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
    // 宿主死亡：就地终态（streaming 翻 false + crashed）→ 崩溃抑制，卡片保留
    store.getState().applyEvent({ type: 'host', phase: 'restarting' }, 2);
    await drain();
    expect(log).toEqual([]);
    expect((queuedDrafts.snapshot().t1 ?? []).length).toBe(1);
    // 对账回落 parked（新占位 id）→ 只改绑不投递（卡片仍由用户处置）
    const parked: SessionView = { ...session('p1', '/w/a.jsonl'), state: 'parked' };
    store.getState().applyEvent({ type: 'sessionUpdated', session: parked }, 3);
    await drain();
    expect(log).toEqual([]);
    expect(queuedDrafts.snapshot().p1?.map((draft) => draft.text)).toEqual(['崩溃时排队的消息']);
    // 唤回 resume 换 live id → 改绑 + 空闲接续投递（原轮已死，轮后等待结束）
    store.getState().applyEvent({ type: 'sessionUpdated', session: session('t2', '/w/a.jsonl') }, 4);
    await drain();
    expect(log).toEqual([{ threadId: 't2', text: '崩溃时排队的消息', mode: 'followUp' }]);
    disconnect();
  });

  test('路径无宿主的移除（未落盘会话）丢弃暂存', () => {
    const { log, drive, disconnect } = setup();
    void log;
    stage('t1', null, '首条消息前的会话暂存');
    drive({ type: 'sessionUpdated', session: session('t1', null) });
    // 暂存前提是流式中（线程态必然存在），随后会话被移除且无路径可改绑
    drive({ type: 'turnStarted', threadId: 't1', at: 1 });
    drive({ type: 'sessionRemoved', threadId: 't1' }, 2);
    expect(queuedDrafts.snapshot().t1).toBeUndefined();
    disconnect();
  });
});
