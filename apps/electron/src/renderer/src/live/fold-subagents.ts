import type { UiEvent } from '@paiapp/contracts';
import type { SubagentModel } from '@/thread/thread-model';

import { noteCallStart, omitCallStart, type LiveThreadState } from './live-thread-state';
import { clip } from './turn-ops';

/**
 * 子代理事件折叠：线程级 agents（Agents 面板数据源）upsert。
 * 面板直接读 state.agents；轮内不再挂子代理块（状态展示在输入框徽标，见 T24）。
 */

export type SubagentUiEvent = Extract<
  UiEvent,
  { type: 'subagentStarted' | 'subagentDelta' | 'subagentText' | 'subagentTool' | 'subagentSettled' | 'subagentMessage' }
>;

/** 子代理事件入口：按 subagentId upsert 面板数据。 */
export function onSubagentEvent(state: LiveThreadState, event: SubagentUiEvent, now: number): LiveThreadState {
  switch (event.type) {
    case 'subagentStarted':
      return upsertAgent(state, event.subagentId, now, (agent) => ({
        ...agent,
        name: event.agent,
        agentType: event.agent,
        startedAt: now,
      }));
    case 'subagentDelta':
      return upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, summary: clip(agent.summary + event.delta) }));
    case 'subagentText':
      return upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, summary: clip(event.text) }));
    case 'subagentTool':
      return onSubagentTool(state, event, now);
    case 'subagentSettled':
      return upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, status: 'done', endedAt: now }));
    case 'subagentMessage':
      return upsertAgent(state, event.subagentId, now, (agent) => ({
        ...agent,
        summary: agent.summary.length > 0 ? `${agent.summary}\n${event.text}` : event.text,
      }));
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
    const key = `${event.subagentId}:${event.call.id}`;
    const withStart = { ...state, callStarts: noteCallStart(state.callStarts, key, now) };
    return upsertAgent(withStart, event.subagentId, now, (agent) => ({
      ...agent,
      toolCount: agent.toolCount + 1,
      tools: [
        ...agent.tools,
        { id: event.call.id, name: event.call.name, argsPreview: event.call.argsPreview, output: '', exitCode: null, durationMs: null, status: 'running' },
      ],
    }));
  }
  if (event.phase === 'update') {
    return upsertAgent(state, event.subagentId, now, (agent) => ({
      ...agent,
      tools: agent.tools.map((tool) => (tool.id === event.call.id ? { ...tool, output: clip(event.output ?? tool.output) } : tool)),
    }));
  }
  const key = `${event.subagentId}:${event.call.id}`;
  const startedAt = state.callStarts[key];
  const durationMs = typeof startedAt === 'number' ? Math.max(0, now - startedAt) : null;
  return upsertAgent({ ...state, callStarts: omitCallStart(state.callStarts, key) }, event.subagentId, now, (agent) => ({
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
  subagentId: string,
  now: number,
  patch: (agent: SubagentModel) => SubagentModel,
): LiveThreadState {
  const existing = state.agents.find((agent) => agent.id === subagentId);
  if (existing === undefined) {
    const agent: SubagentModel = {
      id: subagentId,
      name: subagentId,
      agentType: '',
      model: '',
      effort: '',
      tokens: null,
      toolCount: 0,
      status: 'working',
      startedAt: now,
      endedAt: null,
      summary: '',
      tools: [],
    };
    return { ...state, agents: [...state.agents, patch(agent)] };
  }
  return {
    ...state,
    agents: state.agents.map((agent) => (agent.id === subagentId ? { ...patch(agent) } : agent)),
  };
}
