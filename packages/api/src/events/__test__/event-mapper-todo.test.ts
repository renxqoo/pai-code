import { describe, expect, test } from 'bun:test';

import { createEventMapper, type EventMapper } from '../event-mapper';

/**
 * todo 面（T44）：todo/snapshot 放行 → todoSnapshot 事件（垃圾形状跳过不清零）；
 * todo 清单工具在对话流零痕迹（主会话与子代理两路；tool/result 按名或记忆桶过滤）。
 */

const deps = { now: () => 1_000 };

type Frame = Parameters<EventMapper['mapEvent']>[0];

function frame(name: string, payload: Record<string, unknown>, agentName?: string): Frame {
  return { threadId: 't', name, payload, ...(agentName !== undefined ? { agentName } : {}) };
}

const snapshotPayload = {
  session: 't',
  seq: 3,
  tasks: [
    { id: '1', subject: '批次 A', status: 'completed' },
    { id: '2', subject: '批次 B', status: 'in_progress', description: '收窄', activeForm: '收窄 task-tools', owner: 'worker-2' },
    { id: '3', subject: '批次 C', status: 'pending' },
  ],
  edges: [['1', '2']],
};

describe('todo/snapshot → todoSnapshot', () => {
  test('全量快照透传（含三态任务与依赖边）', () => {
    const events = createEventMapper(deps).mapEvent(frame('todo/snapshot', snapshotPayload));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'todoSnapshot',
      threadId: 't',
      snapshot: {
        seq: 3,
        tasks: [
          { id: '1', subject: '批次 A', status: 'completed' },
          { id: '2', subject: '批次 B', status: 'in_progress', description: '收窄', activeForm: '收窄 task-tools', owner: 'worker-2' },
          { id: '3', subject: '批次 C', status: 'pending' },
        ],
        edges: [['1', '2']],
      },
    });
  });

  test('垃圾形状跳过（不产事件、不清既有快照）', () => {
    expect(createEventMapper(deps).mapEvent(frame('todo/snapshot', { session: 't', seq: 'x', tasks: {}, edges: [] }))).toEqual([]);
    expect(createEventMapper(deps).mapEvent(frame('todo/snapshot', { session: 't' }))).toEqual([]);
    expect(createEventMapper(deps).mapEvent(frame('todo/snapshot', { session: 't', seq: 1, tasks: [{ id: '1', status: 'deleted' }], edges: [] }))).toEqual([]);
  });

  test('子会话帧不进主时间线（session ≠ threadId）', () => {
    expect(createEventMapper(deps).mapEvent(frame('todo/snapshot', { ...snapshotPayload, session: 'other' }))).toEqual([]);
  });

  test('空清单快照照常透传（全删 = 显式空态）', () => {
    const events = createEventMapper(deps).mapEvent(frame('todo/snapshot', { session: 't', seq: 4, tasks: [], edges: [] }));
    expect(events).toEqual([{ type: 'todoSnapshot', threadId: 't', snapshot: { seq: 4, tasks: [], edges: [] } }]);
  });
});

describe('todo 工具零痕迹', () => {
  test.each(['task_create', 'task_get', 'task_list', 'task_update'])('主会话 %s tool/call|result 均无渲染事件', (name) => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('tool/call', { session: 't', callId: 'c1', name, arguments: '{}' }))).toEqual([]);
    expect(mapper.mapEvent(frame('tool/result', { session: 't', callId: 'c1', content: 'ok' }))).toEqual([]);
  });

  test('tool/result 无 name 字段时按记忆桶回查过滤（tool/call 先注册）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(frame('tool/call', { session: 't', callId: 'c2', name: 'task_update', arguments: '{}' }));
    expect(mapper.mapEvent(frame('tool/result', { session: 't', callId: 'c2', content: 'ok' }))).toEqual([]);
  });

  test('非 todo 工具照常渲染（过滤不误伤）', () => {
    const mapper = createEventMapper(deps);
    const started = mapper.mapEvent(frame('tool/call', { session: 't', callId: 'c3', name: 'bash', arguments: '{"command":"ls"}' }));
    expect(started).toHaveLength(1);
    expect(started[0]?.type).toBe('toolCallAdded');
    const ended = mapper.mapEvent(frame('tool/result', { session: 't', callId: 'c3', content: 'ok' }));
    expect(ended).toHaveLength(1);
    expect(ended[0]?.type).toBe('toolEnded');
  });

  test('子代理工具面同零痕迹；症状回归「子代理 todo tool/result 漏滤」——tool/result 词条无 name，靠记忆桶回查', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('tool/call', { session: 't', callId: 'c4', name: 'task_list', arguments: '{}' }, 'a1'))).toEqual([]);
    // x-harness tool/result 载荷无 name 字段（夹具不得虚构——线上取不到）
    expect(mapper.mapEvent(frame('tool/result', { session: 't', callId: 'c4', content: 'ok' }, 'a1'))).toEqual([]);
    // 子代理的非 todo 工具照常（start 过；end 无名也放行）
    expect(mapper.mapEvent(frame('tool/call', { session: 't', callId: 'c5', name: 'read', arguments: '{}' }, 'a1'))).toHaveLength(1);
    const ended = mapper.mapEvent(frame('tool/result', { session: 't', callId: 'c5', content: 'ok' }, 'a1'));
    expect(ended).toHaveLength(1);
    expect(ended[0]?.type).toBe('subagentTool');
  });
});