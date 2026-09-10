import type { DemoAgentSeed, DemoBlockSpec, DemoCommandStep, DemoTurnScript } from './demo-turn-script';
import type { SubagentModel, ToolCallModel, TurnBlock, TurnModel, TurnStatus } from '@/thread/thread-model';

export type LiveTurnSpec = {
  turnId: string;
  startedAt: number;
  script: DemoTurnScript;
};

type CallStep = Pick<DemoCommandStep, 'exitCode' | 'durationMs' | 'output'> & {
  name: string;
  argsPreview: string;
};

/**
 * 单次工具调用在观察时刻的状态：结束后带退出码与耗时；
 * 被停止截断的调用显 stopped，绝不把未完成的调用画成成功。
 */
function deriveCall(step: CallStep, callId: string, startAt: number, clock: number, turnEnded: boolean): ToolCallModel {
  const endAt = startAt + step.durationMs;
  if (clock >= endAt) {
    return {
      id: callId,
      name: step.name,
      argsPreview: step.argsPreview,
      subagents: [],
      output: step.output,
      exitCode: step.exitCode,
      durationMs: step.durationMs,
      status: step.exitCode === 0 ? 'ok' : 'failed',
    };
  }
  if (turnEnded) {
    return {
      id: callId,
      name: step.name,
      argsPreview: step.argsPreview,
      subagents: [],
      output: step.output,
      exitCode: null,
      durationMs: Math.max(0, clock - startAt),
      status: 'stopped',
    };
  }
  return {
    id: callId,
    name: step.name,
    argsPreview: step.argsPreview,
    subagents: [],
    output: step.output,
    exitCode: null,
    durationMs: null,
    status: 'running',
  };
}

function deriveCommandStep(step: DemoCommandStep, callId: string, startAt: number, clock: number, turnEnded: boolean): ToolCallModel {
  return deriveCall({ name: 'Bash', argsPreview: step.command, output: step.output, exitCode: step.exitCode, durationMs: step.durationMs }, callId, startAt, clock, turnEnded);
}

/** 子代理在观察时刻的快照：被轮次收尾截断的子代理按已完成冻结，无报告摘要。 */
function deriveAgent(seed: DemoAgentSeed, blockRevealAt: number, clock: number, turnEnded: boolean): SubagentModel {
  const bornAt = blockRevealAt + seed.bornAtMs;
  const doneAt = seed.doneAfterMs === null ? null : bornAt + seed.doneAfterMs;
  const finished = doneAt !== null && clock >= doneAt;
  const cutOff = turnEnded && !finished;
  const tools = seed.tools
    .map((step, index) => ({ step, index }))
    .filter((entry) => clock >= bornAt + entry.step.atMs)
    .map((entry) => deriveCall({ name: entry.step.name, argsPreview: entry.step.argsPreview, output: '', exitCode: 0, durationMs: entry.step.durationMs }, `${seed.id}-tool-${entry.index}`, bornAt + entry.step.atMs, clock, turnEnded));
  const tokensReached = seed.tokens !== null && seed.tokensAtMs !== null && clock >= bornAt + seed.tokensAtMs;
  return {
    id: seed.id,
    name: seed.name,
    agentType: seed.agentType,
    model: seed.model,
    effort: seed.effort,
    tokens: tokensReached ? seed.tokens : null,
    toolCount: tools.length,
    status: finished || cutOff ? 'done' : 'working',
    startedAt: bornAt,
    endedAt: finished && doneAt !== null ? doneAt : cutOff ? clock : null,
    summary: cutOff ? '' : seed.summary,
    tools,
  };
}

/** 子代理不进轮内块——deriveLiveTurn 对 subagents spec 分流到 deriveSubagentAgents，本函数只见其余块形态。 */
type BlockSpec = Exclude<DemoBlockSpec, { kind: 'subagents' }>;

function deriveBlock(spec: BlockSpec, startedAt: number, clock: number, turnEnded: boolean): TurnBlock | null {
  const revealAt = startedAt + spec.atMs;
  // 还没到出现时刻的块不占位，避免提前露出尚未发生的正文与过程块
  if (clock < revealAt) return null;
  if (spec.kind === 'text') {
    return { kind: 'text', id: spec.id, text: spec.text };
  }
  if (spec.kind === 'commands') {
    const calls = spec.commands
      .map((step, index) => ({ step, index }))
      .filter((entry) => clock >= revealAt + entry.step.atMs)
      .map((entry) => deriveCommandStep(entry.step, `${spec.id}-${entry.index}`, revealAt + entry.step.atMs, clock, turnEnded));
    return { kind: 'tools', id: spec.id, calls };
  }
  return { kind: 'diff', id: spec.id, diff: spec.diff };
}

/** 观察时刻的子代理快照（面板数据源）：块出现后按出生偏移逐个现身。 */
function deriveSubagentAgents(
  spec: Extract<DemoBlockSpec, { kind: 'subagents' }>,
  startedAt: number,
  clock: number,
  turnEnded: boolean,
): SubagentModel[] {
  const revealAt = startedAt + spec.atMs;
  if (clock < revealAt) return [];
  return spec.agents
    .filter((seed) => clock >= revealAt + seed.bornAtMs)
    .map((seed) => deriveAgent(seed, revealAt, clock, turnEnded));
}

/** 时刻 t 的进行中轮次快照；stopAtMs 非空表示用户已停止，冻结在那一刻。 */
export function deriveLiveTurn(spec: LiveTurnSpec, now: number, stopAtMs: number | null): { turn: TurnModel; agents: SubagentModel[] } {
  const { turnId, startedAt, script } = spec;
  const autoEndAt = script.completeAtMs === null ? null : startedAt + script.completeAtMs;
  const scheduledEndAt = stopAtMs ?? autoEndAt;
  const observedAt = Number.isFinite(now) && now > 0 ? now : startedAt;
  const ended = scheduledEndAt !== null && observedAt >= scheduledEndAt;
  const clock = ended && scheduledEndAt !== null ? scheduledEndAt : observedAt;
  const status: TurnStatus = ended ? (stopAtMs !== null ? 'stopped' : 'completed') : 'running';
  const blocks: TurnBlock[] = [];
  const agents: SubagentModel[] = [];
  for (const blockSpec of script.blocks) {
    if (blockSpec.kind === 'subagents') {
      agents.push(...deriveSubagentAgents(blockSpec, startedAt, clock, ended));
      continue;
    }
    const block = deriveBlock(blockSpec, startedAt, clock, ended);
    if (block === null) continue;
    blocks.push(block);
  }
  return {
    turn: {
      id: turnId,
      status,
      startedAt,
      endedAt: ended ? clock : null,
      blocks,
      streamingThinkingBlockId: null,
    },
    agents,
  };
}
