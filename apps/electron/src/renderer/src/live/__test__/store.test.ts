import { describe, expect, test } from 'bun:test';

import { createLiveStore, threadModelOf } from '../store';
import type { PreferencesView, SessionView, UiEvent } from '@paiapp/contracts';

const session = (threadId: string): SessionView => ({
  threadId,
  cwd: '/w',
  sessionPath: null,
  title: 'T',
  state: 'live',
  streaming: false,
  model: null,
  thinkingLevel: null,
  lastActivityAt: 1,
});

const preferencesOf = (defaultModel: string | null): PreferencesView => ({
  defaultModel,
  onboarded: true,
  projectModels: {},
  pinnedSessions: [],
  trustedDefault: false,
  hiddenProjects: [],
  idleRecycleMinutes: 5,
  archivedSessions: [],
});

const bootstrapOf = (sessions: readonly SessionView[], hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null = 'ready') => ({
  sessions: [...sessions],
  saved: [],
  models: [],
  providers: [],
  preferences: preferencesOf(null),
  hostPhase,
});

describe('live store（对话框/通知/bootstrap 合并）', () => {
  test('dialogRequest 入队（confirm 三字段平铺透传）→ dialogSettled 移除（ui_response 无事件回执，客户端自治结算）', () => {
    const store = createLiveStore();
    const request: UiEvent = { type: 'dialogRequest', threadId: 't', requestId: 'r1', method: 'confirm', tool: 'bash', summary: 'ls', agentName: 'explore' };
    store.getState().applyEvent(request, 1);
    expect(store.getState().dialogs).toEqual([
      { requestId: 'r1', threadId: 't', method: 'confirm', tool: 'bash', summary: 'ls', reason: undefined, agentName: 'explore' },
    ]);
    store.getState().applyEvent({ type: 'dialogSettled', requestId: 'r1' }, 2);
    expect(store.getState().dialogs).toEqual([]);
    // 未知 id 的 settle 无害
    store.getState().applyEvent({ type: 'dialogSettled', requestId: 'ghost' }, 3);
    expect(store.getState().dialogs).toEqual([]);
  });

  test('dialogRequest 同 requestId 重投去重（与收敛读口路径对称）', () => {
    const store = createLiveStore();
    const request = { type: 'dialogRequest', threadId: 't', requestId: 'r9', method: 'confirm', tool: 'bash', summary: 'ls' } as const;
    store.getState().applyEvent(request, 1);
    store.getState().applyEvent(request, 2);
    expect(store.getState().dialogs.map((dialog) => dialog.requestId)).toEqual(['r9']);
  });

  test('bootstrap 合并在途线程状态（不重置已折叠的流式现场）', () => {
    const store = createLiveStore();
    store.getState().bootstrap({ ...bootstrapOf([session('t1')]), preferences: preferencesOf('glm/glm-4.7') });
    // 偏好随 bootstrap 快照折叠（defaultModel 透传，供 createSession 回落与向导判定）
    expect(store.getState().preferences).toEqual(preferencesOf('glm/glm-4.7'));
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 5 }, 5);
    // 二次 bootstrap（StrictMode/重入）不得清掉流式状态
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    expect(store.getState().threads['t1']?.streaming).toBe(true);
    expect(store.getState().threads['t1']?.items.length).toBe(1);
    expect(store.getState().threads['t2']).toBeDefined();
    // 滞后快照不清在途会话（B-P5/P7 合并语义）：t1 保留，由 sessionRemoved 显式清理
    store.getState().bootstrap(bootstrapOf([session('t2')]));
    expect(store.getState().threads['t1']).toBeDefined();
    expect(store.getState().sessions['t1']).toBeDefined();
    store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 9);
    expect(store.getState().threads['t1']).toBeUndefined();
  });

  test('sessionRemoved 清线程与活跃指针', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    store.getState().setActiveThread('t1');
    store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 1);
    expect(store.getState().activeThreadId).not.toBe('t1');
    expect('t1' in store.getState().sessions).toBe(false);
  });

  test('症状回归：setActiveThread 切换同步清空会话级视图（防旧会话权限模式残留一帧）；同值重设不清', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    const mode = { mode: 'default', source: 'session' as const };
    store.setState({ sessionPermissionMode: mode, thinkingLevel: { level: 'high', source: 'session' } });
    store.getState().setActiveThread('t2');
    expect(store.getState().sessionPermissionMode).toBeNull();
    expect(store.getState().thinkingLevel).toBeNull();
    // 同值重设不失效：切会话 effect 以 activeThreadId 为 deps，同值不重拉
    store.setState({ sessionPermissionMode: mode });
    store.getState().setActiveThread('t2');
    expect(store.getState().sessionPermissionMode).toBe(mode);
  });

  test('host/sessionUpdated 会话表维护 + sessionDied 线程标记', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1')]));
    store.getState().applyEvent({ type: 'host', phase: 'restarting' }, 1);
    expect(store.getState().hostPhase).toBe('restarting');
    store.getState().applyEvent({ type: 'sessionUpdated', session: { ...session('t1'), streaming: true } }, 2);
    expect(store.getState().sessions['t1']?.streaming).toBe(true);
    store.getState().applyEvent({ type: 'sessionDied', threadId: 't1', reason: 'crash' }, 5);
    expect(store.getState().threads['t1']?.crashed).toBe(true);
    // 未知线程的对话流事件兜底建线程（不崩溃）
    store.getState().applyEvent({ type: 'queueChanged', threadId: 'ghost', steering: [], followUp: [{ id: 'qg', text: 'm' }] }, 6);
    expect(store.getState().threads['ghost']?.queue.followUp).toEqual([{ id: 'qg', text: 'm' }]);
  });

  test('症状回归：host restarting/failed 就地终态全部线程在途面（宿主死亡后空闲会话新消息不再进排队）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 2 }, 2);
    store.getState().applyEvent({ type: 'queueChanged', threadId: 't1', steering: [], followUp: [{ id: 'q1', text: '等轮末' }] }, 3);
    store.getState().applyEvent({ type: 'queueChanged', threadId: 't2', steering: [{ id: 'q2', text: '插入' }], followUp: [] }, 4);
    // 宿主挂死重启：全部线程的运行面随进程消亡（不会有 turnSettled/queueChanged）
    store.getState().applyEvent({ type: 'host', phase: 'restarting' }, 5);
    expect(store.getState().threads['t1']?.streaming).toBe(false);
    expect(store.getState().threads['t1']?.queue).toEqual({ steering: [], followUp: [] });
    expect(store.getState().threads['t2']?.queue).toEqual({ steering: [], followUp: [] });
    const turn = store.getState().threads['t1']?.items[0];
    expect(turn).toMatchObject({ kind: 'turn', turn: { status: 'completed', endedAt: 5 } });
    // ready 不再有额外清理动作（重启后空闲，状态由后续事件重建）
    store.getState().applyEvent({ type: 'host', phase: 'ready' }, 6);
    expect(store.getState().hostPhase).toBe('ready');
    // failed 同样终态（重启失败时在途面早已消亡）
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't2', at: 7 }, 7);
    store.getState().applyEvent({ type: 'host', phase: 'failed' }, 8);
    expect(store.getState().threads['t2']?.streaming).toBe(false);
    // 挂起对话框随宿主进程消亡：立即收起（不等 5 分钟兜底超时）；线程标记 crashed 供横幅提示中断
    store.setState({ dialogs: [{ requestId: 'r1', threadId: 't1', method: 'confirm' }] });
    store.getState().applyEvent({ type: 'host', phase: 'restarting' }, 9);
    expect(store.getState().dialogs).toEqual([]);
    expect(store.getState().threads['t1']?.crashed).toBe(true);
  });

  test('症状回归：host 重启折叠同步清 hydrateFailed（旧世代失败标志不得残留误呈加载失败）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1')]));
    store.getState().hydrate('t1', { kind: 'hydrate/failed' });
    expect(store.getState().threads['t1']?.hydrateFailed).toBe(true);
    store.getState().applyEvent({ type: 'host', phase: 'restarting' }, 5);
    expect(store.getState().threads['t1']?.hydrateFailed).toBe(false);
    expect(store.getState().threads['t1']?.hydrated).toBe(false);
  });

  test('症状回归：host 重启折叠清空 hydrated——回落 parked 后再次激活必须重拉全量（防旧数据陈旧展示）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1')]));
    // 已水化的线程（hydrate/initial 置 hydrated）
    store.getState().hydrate('t1', { kind: 'hydrate/initial', items: [], cursor: 1 });
    expect(store.getState().threads['t1']?.hydrated).toBe(true);
    // 宿主重启：hydrated 随运行面一起失效（同 threadId 回落后旧数据可能落后于盘上会话）
    store.getState().applyEvent({ type: 'host', phase: 'restarting' }, 5);
    expect(store.getState().threads['t1']?.hydrated).toBe(false);
    // 数据保留展示（不闪空），重拉由激活 effect 驱动
    expect(store.getState().threads['t1']?.cursor).toBe(1);
  });

  test('症状回归：sessionDied 立即收起该会话挂起对话框（其余会话弹窗不受影响）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    store.getState().applyEvent({ type: 'dialogRequest', threadId: 't1', requestId: 'r1', method: 'confirm', tool: 'bash', summary: '允许执行？' }, 1);
    store.getState().applyEvent({ type: 'dialogRequest', threadId: 't2', requestId: 'r2', method: 'confirm', tool: 'bash', summary: '另一个会话' }, 2);
    store.getState().applyEvent({ type: 'sessionDied', threadId: 't1', reason: 'crash' }, 3);
    expect(store.getState().dialogs.map((dialog) => dialog.requestId)).toEqual(['r2']);
    expect(store.getState().threads['t1']?.crashed).toBe(true);
  });

  test('hydrate/stopIntent/updateStats/reset 动作', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1')]));
    store.getState().hydrate('t1', {
      kind: 'hydrate/initial',
      items: [{ kind: 'user', id: 'seq-1', text: 'hi', origin: 'user', images: [], at: 1 }],
      cursor: 1,
    });
    expect(store.getState().threads['t1']?.items.length).toBe(1);
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 2 }, 2);
    store.getState().stopIntent('t1');
    expect(store.getState().threads['t1']?.stopping).toBe(true);
    const stats = { userMessages: 2, assistantMessages: 3, toolCalls: 4, tokens: { input: 10, output: 20, total: 30 }, cost: 0.5 };
    store.getState().updateStats('t1', stats);
    expect(store.getState().stats['t1']).toEqual(stats);
    store.getState().reset();
    expect(store.getState().bootstrapLoaded).toBe(false);
  });

  test('症状回归：host 从未启动时 bootstrap 落 hostPhase=null（宿主未连接，非「没有模型」）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([], null));
    expect(store.getState().hostPhase).toBeNull();
  });

  test('症状回归：bootstrap 快照不回滚先到的 host 事件（滞后合并语义）', () => {
    const store = createLiveStore();
    store.getState().applyEvent({ type: 'host', phase: 'failed' }, 1);
    store.getState().bootstrap(bootstrapOf([]));
    expect(store.getState().hostPhase).toBe('failed');
  });
});

describe('threadModelOf 引用稳定', () => {
  test('症状回归：无关 set（后台线程事件/其他字段更新）不再让活跃线程模型换引用', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    store.getState().hydrate('t1', {
      kind: 'hydrate/initial',
      items: [{ kind: 'user', id: 'seq-1', text: 'hi', origin: 'user', images: [], at: 1 }],
      cursor: 1,
    });
    const first = threadModelOf(store.getState(), 't1');
    // 后台线程 t2 的 delta（threads 其他条目换引用）+ 无关字段（stats）
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't2', at: 2 }, 2);
    store.getState().applyEvent({ type: 'textDelta', threadId: 't2', messageId: 'm1', delta: 'x' }, 3);
    store.getState().updateStats('t2', { userMessages: 1, assistantMessages: 0, toolCalls: 0, tokens: { input: 1, output: 0, total: 1 }, cost: 0 });
    expect(threadModelOf(store.getState(), 't1')).toBe(first);
  });

  test('活跃线程自身折叠更新后模型换引用（内容跟进）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1')]));
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
    const first = threadModelOf(store.getState(), 't1');
    store.getState().applyEvent({ type: 'textDelta', threadId: 't1', messageId: 'm1', delta: 'x' }, 2);
    const second = threadModelOf(store.getState(), 't1');
    expect(second).not.toBe(first);
    expect(second.items).not.toBe(first.items);
  });
});

describe('pushNotice（通知条单一入口）', () => {
  test('追加保留最近 5 条，id 单调可逐条 dismiss', () => {
    const store = createLiveStore();
    for (let i = 1; i <= 7; i += 1) {
      store.getState().pushNotice(`通知${i}`);
    }
    const notices = store.getState().notices;
    expect(notices.map((notice) => notice.text)).toEqual(['通知3', '通知4', '通知5', '通知6', '通知7']);
    const ids = new Set(notices.map((notice) => notice.id));
    expect(ids.size).toBe(5);

    store.getState().dismissNotice(notices[0]?.id ?? '');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual(['通知4', '通知5', '通知6', '通知7']);
  });
});

describe('sessionRemoved 同路径后继（换 id 不闪跳）', () => {
  test('移除的活跃会话存在同文件新 id 时优先回落到新 id', () => {
    const store = createLiveStore();
    const oldView = { ...session('t1'), sessionPath: '/w/s/a.jsonl' };
    const other = { ...session('t2'), sessionPath: '/w/s/b.jsonl' };
    const successor = { ...session('t9'), sessionPath: '/w/s/a.jsonl' };
    store.getState().bootstrap(bootstrapOf([oldView, other, successor]));
    store.getState().setActiveThread('t1');

    store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 1);

    expect(store.getState().activeThreadId).toBe('t9');
  });

  test('无同路径后继时维持既有回退（首个会话）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    store.getState().setActiveThread('t1');

    store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 1);

    expect(store.getState().activeThreadId).toBe('t2');
  });
});

describe('pushNotice 文案去重', () => {
  test('同文案重投只保留一条（并发唤醒失败不刷屏）', () => {
    const store = createLiveStore();
    store.getState().pushNotice('会话恢复失败，请重试。');
    store.getState().pushNotice('会话恢复失败，请重试。');
    store.getState().pushNotice('会话恢复失败，请重试。');
    expect(store.getState().notices.map((notice) => notice.text)).toEqual(['会话恢复失败，请重试。']);
  });
});


describe('sessionParked 收编折叠（T29：worker 回收后侧栏即时转 parked）', () => {
  test('症状回归：回收后视图转 parked、streaming 复位、挂起对话框收起、线程非 crashed', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1'), session('t2')]));
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
    store.getState().applyEvent({ type: 'dialogRequest', threadId: 't1', requestId: 'r1', method: 'confirm', tool: 'bash', summary: '允许执行？' }, 2);

    store.getState().applyEvent({ type: 'sessionParked', threadId: 't1', reason: 'idle' }, 3);

    expect(store.getState().sessions['t1']?.state).toBe('parked');
    expect(store.getState().sessions['t1']?.streaming).toBe(false);
    expect(store.getState().dialogs.length).toBe(0);
    expect(store.getState().threads['t1']?.crashed).toBe(false);
    expect(store.getState().threads['t1']?.streaming).toBe(false);
    // 回收打断的在途回合冻结为 stopped——不得伪装成自然完成（对比 sessionDied 的 completed）
    const items = store.getState().threads['t1']?.items ?? [];
    const turn = items.find((item) => item.kind === 'turn');
    expect(turn !== undefined && turn.kind === 'turn' ? turn.turn.status : null).toBe('stopped');
    // 未知线程（表外会话）不崩溃、不落视图
    store.getState().applyEvent({ type: 'sessionParked', threadId: 'ghost', reason: 'manual' }, 4);
    expect(store.getState().sessions['ghost']).toBeUndefined();
  });

  test('重复收编幂等（已 parked 不再改写）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t1')]));
    store.getState().applyEvent({ type: 'sessionParked', threadId: 't1', reason: 'idle' }, 1);
    const first = store.getState().sessions['t1'];
    store.getState().applyEvent({ type: 'sessionParked', threadId: 't1', reason: 'manual' }, 2);
    expect(store.getState().sessions['t1']).toBe(first);
  });
});

test('症状回归「关闭会话后权限弹窗仍挂着可点」：sessionRemoved 随行收走该线程挂起对话框', () => {
  const store = createLiveStore();
  store.getState().bootstrap(bootstrapOf([session('t1')]));
  store.getState().applyEvent({ type: 'dialogRequest', threadId: 't1', requestId: 'r1', method: 'confirm', tool: 'bash', summary: 'ls' }, 1);
  expect(store.getState().dialogs).toHaveLength(1);
  store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 2);
  expect(store.getState().dialogs).toEqual([]);
});
