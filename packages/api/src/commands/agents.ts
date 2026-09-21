/** agents 域命令（类型 CRUD + 子代理操纵 + 弹窗应答）。 */
import type { PaiCommand } from '@paiapp/contracts';

import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

type Input<C extends PaiCommand['type']> = Omit<Extract<PaiCommand, { type: C }>, 'type'>;

export interface AgentCommands {
  createAgent(input: Input<'agents/create'>): Promise<HubResult<unknown>>;
  removeAgent(input: Input<'agents/remove'>): Promise<HubResult<unknown>>;
  /** ack 命令（hub 成功响应无载荷）：成功恒为 null 视图。 */
  steer(input: Input<'subagent/steer'>): Promise<HubResult<null>>;
  respondDialog(input: Input<'ui_response'>): Promise<HubResult<unknown>>;
}

/** ack 视图：成功无载荷恒折叠 null（帧解码对缺省 data 产出 undefined，消费方契约是 null）。 */
function ack(result: HubResult<unknown>): HubResult<null> {
  return result.ok ? { ok: true, data: null } : result;
}

export function createAgentCommands(send: Transport): AgentCommands {
  return {
    createAgent: (input) => send<unknown>({ type: 'agents/create', ...input }, TIMEOUTS.default),
    removeAgent: (input) => send<unknown>({ type: 'agents/remove', ...input }, TIMEOUTS.default),
    steer: (input) => send<unknown>({ type: 'subagent/steer', ...input }, TIMEOUTS.default).then(ack),
    respondDialog: (input) => send<unknown>({ type: 'ui_response', ...input }, TIMEOUTS.default),
  };
}
