import type { UiEvent } from '@paiapp/contracts';
import type { SubagentModel } from '@/thread/thread-model';

import { noteCallStart, omitCallStart, type LiveThreadState } from './live-thread-state';
import { clip } from './turn-ops';

/**
 * 子代理事件折叠：线程级 agents（Agents 面板数据源）upsert。
 * 键 = agentId（x-harness 身份模型：agentId 唯一，type 为定义名展示键）。
 * 面板直接读 state.agents；轮内不再挂子代理块（状态展示在输入框徽标，见 T24）。
 */

export type SubagentUiEvent = Extract<
  UiEvent,
  { type: 'subagentStarted' | 'subagentDelta' | 'subagentTool' | 'subagentSettled' | 'subagentState' }
>;

/** 子代理事件入口：按 agentId upsert 面板数据。 */
export function onSubagentEvent(state: LiveThreadState, event: SubagentUiEvent, now: number): LiveThreadState {
  switch (event.type) {
    case 'subagentStarted':
      // started 携带 agentId/定义名/任务摘要：建行时一次写入（幂等——重放/迟到帧
      // 不覆盖本地已累积的正文与工具；work 缺席的复活行不抹掉本地已知 task）
      return upsertAgent(state, event.agentId, event.agentName, now, (agent) => ({
        ...agent,
        agentId: event.agentId.length > 0 ? event.agentId : agent.agentId,
        name: event.agentName.length > 0 ? event.agentName : agent.name,
        agentType: event.agentName.length > 0 ? event.agentName : agent.agentType,
        task: event.task.length > 0 ? event.task : agent.task,
        status: 'running',
        startedAt: now,
      }));
    case 'subagentDelta':
      return upsertAgent(state, event.agentId, '', now, (agent) => ({ ...agent, summary: clip(agent.summary + event.delta) }));
    case 'subagentTool':
      return onSubagentTool(state, event, now);
    case 'subagentSettled':
      // agent/finished：每运行周期恰一次（终态 stopped——可复活再 running）
      return upsertAgent(state, event.agentId, '', now, (agent) => ({ ...agent, status: 'stopped', endedAt: now }));
    case 'subagentState':
      // 忙闲迁移（agent/status）：终态行不被迟到的 idle 帧复活
      return upsertAgent(state, event.agentId, '', now, (agent) =>
        agent.status === 'stopped' ? agent : { ...agent, status: event.busy ? 'running' : 'idle' },
      );
    default:
      return state;
  }
}

function onSubagentTool(
  state: LiveThreadState,
  event: Extract<UiEvent, { type: 'subagentTool' }>,
  now: number,
): LiveThreadState {
  if (event.phase === 'start') {
    const key = `${event.agentId}:${event.call.id}`;
    const withStart = { ...state, callStarts: noteCallStart(state.callStarts, key, now) };
    return upsertAgent(withStart, event.agentId, '', now, (agent) => ({
      ...agent,
      toolCount: agent.toolCount + 1,
      tools: [
        ...agent.tools,
        { id: event.call.id, name: event.call.name, argsPreview: event.call.argsPreview, subagents: [], output: '', exitCode: null, durationMs: null, status: 'running' },
      ],
    }));
  }
  if (event.phase === 'update') {
    return upsertAgent(state, event.agentId, '', now, (agent) => ({
      ...agent,
      tools: agent.tools.map((tool) => (tool.id === event.call.id ? { ...tool, output: clip(event.output ?? tool.output) } : tool)),
    }));
  }
  const key = `${event.agentId}:${event.call.id}`;
  const startedAt = state.callStarts[key];
  const durationMs = typeof startedAt === 'number' ? Math.max(0, now - startedAt) : null;
  return upsertAgent({ ...state, callStarts: omitCallStart(state.callStarts, key) }, event.agentId, '', now, (agent) => ({
    ...agent,
    tools: agent.tools.map((tool) =>
      tool.id === event.call.id
        ? { ...tool, output: clip(event.output ?? tool.output), exitCode: event.isError === true ? 1 : 0, status: event.isError === true ? 'failed' : 'ok', durationMs }
        : tool,
    ),
  }));
}

function upsertAgent(
  state: LiveThreadState,
  agentId: string,
  nameHint: string,
  now: number,
  patch: (agent: SubagentModel) => SubagentModel,
): LiveThreadState {
  const existing = state.agents.find((agent) => agent.agentId === agentId);
  if (existing === undefined) {
    const agent: SubagentModel = {
      id: agentId,
      agentId,
      name: nameHint,
      agentType: nameHint,
      task: '',
      model: '',
      effort: '',
      tokens: null,
      toolCount: 0,
      status: 'running',
      startedAt: now,
      endedAt: null,
      summary: '',
      pendingAsk: null,
      tools: [],
    };
    return { ...state, agents: [...state.agents, patch(agent)] };
  }
  return {
    ...state,
    agents: state.agents.map((agent) => (agent.agentId === agentId ? { ...patch(agent) } : agent)),
  };
}
