/**
 * 红测：event-mapper StreamState 的 toolStreams/calls 全局键控（callId，未按线程/owner 隔离）。
 *
 * 契约依据（x-harness apps/host-hub/src/worker/event-bridge.ts）：
 * - 桥侧工具增量流键 = `${owner}:${callId}`，结算边沿只清自己的；
 * - 「子代理后台跨父轮运行——父 turn/end 只清父自己的」（settleOwnerStreams 注释）。
 * app 侧 mapper 是全进程单例（pai-runtime.ts:108，跨全部 threadId 共享一个 StreamState），
 * settled 处理却无差别 clear 整个 toolStreams 表——他线程/后台子代理的在途累积被清空。
 * UiEvent toolUpdated 是快照语义（mapper 自己的注释：「协议边界按 callId 累积」），
 * 累积丢失 = 渲染层输出视图突然回缩为单个 delta。
 */
import { expect, test } from 'bun:test';

import { createEventMapper } from '../event-mapper';

const deps = { now: () => 0 };

test('BUG: 他线程 settled 清空本线程在途 tool-stream 累积（跨线程快照断裂）', () => {
  const mapper = createEventMapper(deps);
  // 线程 A：主会话工具增量批（session === threadId 走主路径）
  expect(mapper.mapEvent({ threadId: 'A', name: 'agent/tool-stream', payload: { session: 'A', callId: 'c1', delta: 'part1-' } })).toEqual([
    { type: 'toolUpdated', threadId: 'A', callId: 'c1', output: 'part1-' },
  ]);
  // 线程 B：另一个会话的轮结算（与线程 A 的工具执行无关）
  mapper.mapEvent({ threadId: 'B', name: 'settled', payload: { sendId: 's1', ok: true } });
  // 线程 A 的工具仍在途：下一批快照必须仍包含此前累积（快照语义）
  const events = mapper.mapEvent({ threadId: 'A', name: 'agent/tool-stream', payload: { session: 'A', callId: 'c1', delta: 'part2' } });
  expect(events).toEqual([{ type: 'toolUpdated', threadId: 'A', callId: 'c1', output: 'part1-part2' }]);
});

test('BUG: 主会话 settled 清空后台子代理在途 tool-stream 累积（子代理跨父轮运行）', () => {
  const mapper = createEventMapper(deps);
  const subDelta = (delta: string) =>
    ({ threadId: 't1', agentName: 'agent-1', name: 'agent/tool-stream', payload: { callId: 'c9', delta } }) as Parameters<
      ReturnType<typeof createEventMapper>['mapEvent']
    >[0];
  expect(mapper.mapEvent(subDelta('a'))).toEqual([
    { type: 'subagentTool', threadId: 't1', agentId: 'agent-1', call: { id: 'c9', name: '', argsPreview: '' }, phase: 'update', output: 'a' },
  ]);
  // 父轮结算：子代理仍在后台运行（桥语义：父 turn/end 只清父自己的增量流）
  mapper.mapEvent({ threadId: 't1', name: 'settled', payload: { sendId: 's', ok: true } });
  expect(mapper.mapEvent(subDelta('b'))).toEqual([
    { type: 'subagentTool', threadId: 't1', agentId: 'agent-1', call: { id: 'c9', name: '', argsPreview: '' }, phase: 'update', output: 'ab' },
  ]);
});
