import type { UiEvent } from '@paiapp/contracts';
import type { SubagentModel } from '@/thread/thread-model';

import { noteCallStart, omitCallStart, type LiveThreadState } from './live-thread-state';
import { clip } from './turn-ops';

/**
 * 子代理事件折叠：线程级 agents（Agents 面板数据源）upsert。
 * 键 = agentName（事件流的子代理身份；agentId 只随 subagentStarted 携带，供 steer 寻址）。
 * 面板直接读 state.agents；轮内不再挂子代理块（状态展示在输入框徽标，见 T24）。
 */

export type SubagentUiEvent = Extract<
  UiEvent,
  { type: 'subagentStarted' | 'subagentDelta' | 'subagentTool' | 'subagentSettled' | 'subagentState' | 'subagentAsk' }
>;

/** 子代理事件入口：按 agentName upsert 面板数据。 */
export function onSubagentEvent(state: LiveThreadState, event: SubagentUiEvent, now: number): LiveThreadState {
  switch (event.type) {
    case 'subagentStarted':
      // started 携带 manager 分配的 agentId 与任务描述：建行时一次写入（幂等——
      // 重放/迟到帧不覆盖本地已累积的正文与工具）
      return upsertAgent(state, event.agentName, now, (agent) => ({
        ...agent,
        agentId: event.agentId.length > 0 ? event.agentId : agent.agentId,
        task: event.task.length > 0 ? event.task : agent.task,
        pendingAsk: null,
        startedAt: now,
      }));
    case 'subagentDelta':
      // 正文增量 = agent 已恢复产出：等待中的权限请求不再成立
      return upsertAgent(state, event.agentName, now, (agent) => ({ ...agent, summary: clip(agent.summary + event.delta), pendingAsk: null }));
    case 'subagentTool':
      return onSubagentTool(state, event, now);
    case 'subagentSettled':
      return upsertAgent(state, event.agentName, now, (agent) => ({ ...agent, status: 'on-disk', endedAt: now, pendingAsk: null }));
    case 'subagentState':
      // 忙闲迁移（agents/state）：终态行不被迟到的 idle 帧复活
      return upsertAgent(state, event.agentName, now, (agent) =>
        agent.status === 'on-disk' ? agent : { ...agent, status: event.busy ? 'busy' : 'idle', pendingAsk: null },
      );
    case 'subagentAsk':
      // 协议无应答命令（hub 到期默认拒绝）——面板信息行展示，等待由后续事件自然解除
      return upsertAgent(state, event.agentName, now, (agent) => ({ ...agent, pendingAsk: { toolName: event.toolName, summary: event.summary } }));
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
    const key = `${event.agentName}:${event.call.id}`;
    const withStart = { ...state, callStarts: noteCallStart(state.callStarts, key, now) };
    return upsertAgent(withStart, event.agentName, now, (agent) => ({
      ...agent,
      toolCount: agent.toolCount + 1,
      tools: [
        ...agent.tools,
        { id: event.call.id, name: event.call.name, argsPreview: event.call.argsPreview, subagents: [], output: '', exitCode: null, durationMs: null, status: 'running' },
      ],
    }));
  }
  if (event.phase === 'update') {
    return upsertAgent(state, event.agentName, now, (agent) => ({
      ...agent,
      tools: agent.tools.map((tool) => (tool.id === event.call.id ? { ...tool, output: clip(event.output ?? tool.output) } : tool)),
    }));
  }
  const key = `${event.agentName}:${event.call.id}`;
  const startedAt = state.callStarts[key];
  const durationMs = typeof startedAt === 'number' ? Math.max(0, now - startedAt) : null;
  return upsertAgent({ ...state, callStarts: omitCallStart(state.callStarts, key) }, event.agentName, now, (agent) => ({
    ...agent,
    pendingAsk: null,
    tools: agent.tools.map((tool) =>
      tool.id === event.call.id
        ? { ...tool, output: clip(event.output ?? tool.output), exitCode: event.isError === true ? 1 : 0, status: event.isError === true ? 'failed' : 'ok', durationMs }
        : tool,
    ),
  }));
}

function upsertAgent(
  state: LiveThreadState,
  agentName: string,
  now: number,
  patch: (agent: SubagentModel) => SubagentModel,
): LiveThreadState {
  const existing = state.agents.find((agent) => agent.name === agentName);
  if (existing === undefined) {
    const agent: SubagentModel = {
      id: agentName,
      agentId: '',
      name: agentName,
      agentType: agentName,
      task: '',
      model: '',
      effort: '',
      tokens: null,
      toolCount: 0,
      status: 'busy',
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
    agents: state.agents.map((agent) => (agent.name === agentName ? { ...patch(agent) } : agent)),
  };
}
