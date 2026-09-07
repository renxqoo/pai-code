import type { DemoThreadSpec } from './demo-thread-spec';
import { deriveLiveTurn, type LiveTurnSpec } from './derive-demo-turn';
import type { SubagentModel, ThreadItem, ThreadModel, TurnModel } from '@/thread/thread-model';

/** 用户已停止的轮次：key 为 `${sessionId}:${turnId}`，value 为停止时刻。 */
export type StopTable = Readonly<Record<string, number>>;

function collectAgents(turn: TurnModel, into: SubagentModel[]): void {
  for (const block of turn.blocks) {
    if (block.kind !== 'subagents') continue;
    into.push(...block.agents);
  }
}

/** 停止时刻取值：未停止返回 null，停止时刻晚于观察时刻按未停止处理。 */
function stopAtOf(sessionId: string, turnId: string, stops: StopTable, now: number): number | null {
  const at = stops[`${sessionId}:${turnId}`];
  if (at === undefined || !Number.isFinite(at) || at > now) return null;
  return at;
}

/** 观察时刻的会话视图：静态条目直出，live 轮次按时间轴折算，子代理平铺成面板列表。 */
export function deriveDemoThread(spec: DemoThreadSpec, now: number, stops: StopTable): ThreadModel {
  const items: ThreadItem[] = [];
  const agents: SubagentModel[] = [];
  for (const item of spec.items) {
    if (item.kind === 'message') {
      items.push({ kind: 'message', message: item.message });
      continue;
    }
    if (item.kind === 'turn') {
      items.push({ kind: 'turn', turn: item.turn });
      collectAgents(item.turn, agents);
      continue;
    }
    const liveSpec: LiveTurnSpec = { turnId: item.turnId, startedAt: item.startedAt, script: item.script };
    const turn = deriveLiveTurn(liveSpec, now, stopAtOf(spec.sessionId, item.turnId, stops, now));
    items.push({ kind: 'turn', turn });
    collectAgents(turn, agents);
  }
  return { sessionId: spec.sessionId, items, agents };
}
