import { describe, expect, test } from 'bun:test';
import type { HistoryItem, InflightView, ThreadStateView, UiEvent } from '@paiapp/contracts';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { LiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/**
 * 排队全流程（用户验收面）：任务流式中继续发消息 → 主进程 prompt 带 followUp
 * （hub 原子语义：空闲即发、流式入队轮末消费）→ queueChanged 镜像（排队卡片
 * 数据源）→ 结算后队列清空、新轮回显排队消息（经条目对账）→ 排队轮缺工具
 * 终态不报错（running 定格 stopped）。附：converge 恢复队列镜像（刷新衔接）、
 * 发送失败面（host_unavailable 可见）。
 */

type Emit = (event: UiEvent) => void;

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function sessionView(threadId: string) {
  return {
    threadId,
    cwd: '/w',
    sessionPath: `/w/${threadId}.jsonl`,
    title: '排队流程',
    state: 'live' as const,
    streaming: false,
    model: null,
    thinkingLevel: null,
    lastActivityAt: 1,
  };
}

interface Script {
  prompts: Array<{ threadId: string; message: string; streamingBehavior?: string }>;
  entriesItems: HistoryItem[];
  promptResult: { ok: true; data: unknown } | { ok: false; error: { kind: string; face?: string } };
  threadStateQueue: { steering: string[]; followUp: string[] };
  inflight: InflightView;
}

const emptyInflight: InflightView = { turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null };

function makeClient(script: Script) {
  let listener: ((event: unknown) => void) | undefined;
  const client: BridgeClient & { emitToController: Emit } = {
    available: true,
    emitToController: (event) => listener?.(event),
    invoke: (method: string, params?: unknown) => {
      const reply = (value: unknown): Promise<unknown> => Promise.resolve(value);
      if (method === 'app/bootstrap') {
        return reply({
          ok: true,
          data: {
            sessions: [sessionView('t1')],
            saved: [],
            models: [],
            providers: [],
            preferences: {
              defaultModel: null,
              onboarded: true,
              projectModels: {},
              pinnedSessions: [],
              trustedDefault: false,
              hiddenProjects: [],
              idleRecycleMinutes: 5,
              archivedSessions: [],
            },
            hostPhase: 'ready',
          },
        });
      }
      if (method === 'session/prompt') {
        const p = params as { threadId: string; message: string; streamingBehavior?: string };
        script.prompts.push({ threadId: p.threadId, message: p.message, streamingBehavior: p.streamingBehavior });
        return reply(script.promptResult);
      }
      if (method === 'session/entries') return reply({ ok: true, data: { items: [...script.entriesItems], cursor: null } });
      if (method === 'session/inflight') return reply({ ok: true, data: script.inflight });
      if (method === 'session/state') {
        const view: ThreadStateView = {
          model: null,
          isStreaming: false,
          isCompacting: false,
          sessionName: null,
          messageCount: script.entriesItems.length,
          queue: { steering: [...script.threadStateQueue.steering], followUp: [...script.threadStateQueue.followUp] },
        };
        return reply({ ok: true, data: view });
      }
      return reply({ ok: true, data: null });
    },
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
      return () => {
        listener = undefined;
      };
    },
  };
  return client;
}

async function boot(script: Script): Promise<{ store: LiveStore; client: ReturnType<typeof makeClient>; controller: ReturnType<typeof createLiveController> }> {
  const store = createLiveStore();
  const client = makeClient(script);
  const controller = createLiveController(client, store);
  await controller.start();
  store.getState().setActiveThread('t1');
  return { store, client, controller };
}

const thread = (store: LiveStore) => store.getState().threads['t1'];

describe('排队全流程（流式中发消息 → 队列镜像 → 结算消费 → 回显）', () => {
  test('streaming 中 submitDraft → followUp 投递；queueChanged 镜像；结算清空；新轮回显排队消息；缺工具终态定格不报错', async () => {
    const script: Script = {
      prompts: [],
      entriesItems: [],
      promptResult: { ok: true, data: {} },
      threadStateQueue: { steering: [], followUp: [] },
      inflight: emptyInflight,
    };
    const { store, client, controller } = await boot(script);
    const emit = client.emitToController;

    // 首轮流式中
    emit({ type: 'turnStarted', threadId: 't1', at: 1 });
    emit({ type: 'messageStarted', threadId: 't1', messageId: 'm1', at: 2 });
    emit({ type: 'textDelta', threadId: 't1', messageId: 'm1', delta: '正在分析' });
    expect(thread(store)?.streaming).toBe(true);

    // 流式中再发消息：主进程管线 → hub 原子排队（streamingBehavior=followUp）
    const reason = await controller.submitDraft('t1', '排队消息-1');
    expect(reason).toBeNull();
    expect(script.prompts).toEqual([{ threadId: 't1', message: '排队消息-1', streamingBehavior: 'followUp' }]);

    // hub 队列镜像到达（排队卡片数据源）
    emit({ type: 'queueChanged', threadId: 't1', steering: [], followUp: [{ id: 'q-1', text: '排队消息-1' }] });
    expect(thread(store)?.queue).toEqual({ steering: [], followUp: [{ id: 'q-1', text: '排队消息-1' }] });

    // 结算：队列随轮清空
    emit({ type: 'turnSettled', threadId: 't1', ok: true, usage: null });
    emit({ type: 'queueChanged', threadId: 't1', steering: [], followUp: [] });
    expect(thread(store)?.queue.followUp).toEqual([]);

    // 新轮（排队消息消费）：条目对账带回排队消息回显
    script.entriesItems = [
      { kind: 'user', id: 'seq-1', text: '排队消息-1', origin: 'user', images: [], at: 3 },
      { kind: 'assistant', id: 'seq-2', messageTs: 4, text: '收到排队消息', thinking: '', at: 4, toolCalls: [], usage: null, stopReason: null, errorMessage: null },
    ];
    emit({ type: 'turnStarted', threadId: 't1', at: 5 });
    await waitMs(30);
    const texts = JSON.stringify(thread(store)?.items);
    expect(texts).toContain('排队消息-1');

    // 排队轮工具缺终态（hub 异常路径）：toolCallAdded 后直接结算——不抛、running 定格 stopped
    emit({ type: 'messageStarted', threadId: 't1', messageId: 'm2', at: 6 });
    emit({ type: 'toolCallAdded', threadId: 't1', messageId: 'm2', call: { id: 'c9', name: 'bash', argsPreview: 'sleep 99' }, diff: null });
    emit({ type: 'turnSettled', threadId: 't1', ok: true, usage: null });
    const settled = thread(store);
    expect(settled?.streaming).toBe(false);
    const frozen = JSON.stringify(settled?.items);
    expect(frozen).toContain('bash');
    controller.dispose();
  });

  test('刷新衔接：converge 恢复队列镜像（threadState.queue → 排队卡片重建）', async () => {
    const script: Script = {
      prompts: [],
      entriesItems: [],
      promptResult: { ok: true, data: {} },
      threadStateQueue: { steering: [], followUp: [{ id: 'q-0', text: '刷新前排队的消息' }] },
      inflight: emptyInflight,
    };
    const { store, controller } = await boot(script);
    await controller.ensureHydrated('t1');
    await waitMs(20);
    expect(store.getState().threads['t1']?.queue.followUp).toEqual([{ id: 'q-0', text: '刷新前排队的消息' }]);
    controller.dispose();
  });

  test('发送失败面：hub 不可达 → submitDraft 返回 transient face（上层通知精准文案 + 草稿保留重发的依据）', async () => {
    const script: Script = {
      prompts: [],
      entriesItems: [],
      promptResult: { ok: false, error: { kind: 'transient', face: 'host_unavailable' } },
      threadStateQueue: { steering: [], followUp: [] },
      inflight: emptyInflight,
    };
    const { controller } = await boot(script);
    const reason = await controller.submitDraft('t1', '发不出去');
    expect(reason).toBe('host_unavailable');
    controller.dispose();
  });
});
