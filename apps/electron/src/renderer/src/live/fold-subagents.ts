import type { UiEvent } from '@paiapp/contracts';
import type { SubagentModel, ThreadItem } from '@/thread/thread-model';

import type { LiveThreadState } from './live-thread-state';
import { clip, findTurn, updateTurn } from './turn-ops';

/**
 * 子代理事件折叠：线程级 agents（Agent 面板数据源）upsert + 会话级 subagents 块（流内简略条）同步。
 * 条与面板同一数据源：有 live 轮恒挂 live 轮（对话尾部），轮替换随尾部迁移，
 * settle 重建随转写尾部轮存续（attachTailSubagents），无 live 轮的后台收尾事件原位刷新。
 */

const SUBAGENTS_BLOCK_ID = 'subagents';

export type SubagentUiEvent = Extract<
  UiEvent,
  { type: 'subagentStarted' | 'subagentDelta' | 'subagentText' | 'subagentTool' | 'subagentSettled' | 'subagentMessage' }
>;

/** 子代理事件入口：agents upsert 后同步流内简略条。 */
export function onSubagentEvent(state: LiveThreadState, event: SubagentUiEvent, now: number): LiveThreadState {
  switch (event.type) {
    case 'subagentStarted':
      return syncSubagentsBlock(
        upsertAgent(state, event.subagentId, now, (agent) => ({
          ...agent,
          name: event.agent,
          agentType: event.agent,
          startedAt: now,
        })),
      );
    case 'subagentDelta':
      return syncSubagentsBlock(upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, summary: clip(agent.summary + event.delta) })));
    case 'subagentText':
      return syncSubagentsBlock(upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, summary: clip(event.text) })));
    case 'subagentTool':
      return syncSubagentsBlock(onSubagentTool(state, event, now));
    case 'subagentSettled':
      return syncSubagentsBlock(upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, status: 'done', endedAt: now })));
    case 'subagentMessage':
      return syncSubagentsBlock(
        upsertAgent(state, event.subagentId, now, (agent) => ({
          ...agent,
          summary: agent.summary.length > 0 ? `${agent.summary}\n${event.text}` : event.text,
        })),
      );
    default:
      return state;
  }
}

/** 会话级子代理条：与面板同一数据源（state.agents），有 live 轮时恒挂 live 轮（对话尾部），
 * 轮替换时随尾部迁移；无 live 轮（settle 重建后的后台收尾）原位刷新既有块。 */
export function syncSubagentsBlock(state: LiveThreadState): LiveThreadState {
  if (state.agents.length === 0) return state;
  const liveTurn = findTurn(state, state.liveTurnId);
  if (liveTurn === null) {
    let changed = false;
    const items = state.items.map((item) => {
      if (item.kind !== 'turn' || !item.turn.blocks.some((block) => block.kind === 'subagents')) return item;
      changed = true;
      return {
        kind: 'turn' as const,
        turn: { ...item.turn, blocks: item.turn.blocks.map((block) => (block.kind === 'subagents' ? { ...block, agents: state.agents } : block)) },
      };
    });
    return changed ? { ...state, items } : state;
  }
  if (liveTurn.blocks.some((block) => block.kind === 'subagents')) {
    return updateTurn(state, liveTurn.id, (current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.kind === 'subagents' ? { ...block, agents: state.agents } : block)),
    }));
  }
  // 条不在 live 轮（旧轮被轮边界退役/重建挂尾）：剥除旧位置，挂 live 轮尾部
  const items = state.items.map((item) => {
    if (item.kind !== 'turn' || item.turn.id === liveTurn.id) return item;
    const blocks = item.turn.blocks.filter((block) => block.kind !== 'subagents');
    return blocks.length === item.turn.blocks.length ? item : { kind: 'turn' as const, turn: { ...item.turn, blocks } };
  });
  return updateTurn({ ...state, items }, liveTurn.id, (current) => ({
    ...current,
    blocks: [...current.blocks, { kind: 'subagents', id: SUBAGENTS_BLOCK_ID, agents: state.agents }],
  }));
}

/** 子代理条挂对话尾部轮（rebuild 存续）：转写重建后追加到最末 turn 的块尾；无 turn 可挂时丢弃（面板仍持有数据）。 */
export function attachTailSubagents(items: readonly ThreadItem[], agents: readonly SubagentModel[]): readonly ThreadItem[] {
  if (agents.length === 0) return items;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind !== 'turn') continue;
    const next = [...items];
    next[index] = {
      kind: 'turn',
      turn: {
        ...item.turn,
        blocks: [...item.turn.blocks.filter((block) => block.kind !== 'subagents'), { kind: 'subagents', id: SUBAGENTS_BLOCK_ID, agents }],
      },
    };
    return next;
  }
  return items;
}

function onSubagentTool(
  state: LiveThreadState,
  event: Extract<UiEvent, { type: 'subagentTool' }>,
  now: number,
): LiveThreadState {
  if (event.phase === 'start') {
    const key = `${event.subagentId}:${event.call.id}`;
    const withStart = { ...state, callStarts: { ...state.callStarts, [key]: now } };
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
  const startedAt = state.callStarts[`${event.subagentId}:${event.call.id}`];
  const durationMs = typeof startedAt === 'number' ? Math.max(0, now - startedAt) : null;
  return upsertAgent(state, event.subagentId, now, (agent) => ({
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
