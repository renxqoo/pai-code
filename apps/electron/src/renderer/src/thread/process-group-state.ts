import type { TurnRun } from './process-runs';

/**
 * 过程组的默认开合判据：
 *
 * **默认一律收起**，两条例外——都是「别处看不到的进度」，收起即信息丢失：
 * - 组内有**运行中**的调用：在途那条必须看得见；
 * - **子代理在跑**：子代理清单只在这个组里。
 *
 * 为什么连末尾那组也收：过程组是「为此处结论做的铺垫」或最终细节，
 * 正文与结果文本才是主角。末尾组在轮收起时本就不可见（`visibleTurnBlocks`
 * 只留结果文本），用户在状态行点开轮次后看到的若是十几行流水、而非结论，
 * 展开就失去了意义——所以轮展开时过程组仍以标题 + 限高列表呈现。
 *
 * 失败**不**触发自动展开：失败信息在正文与错误块里已经有一份，
 * 标题染红即可，不必把整屏让给过程。
 *
 * 手动意图优先于本裁决（见 `CollapsePref`）。
 */

export type ProcessGroupInput = {
  /** 目标过程组 */
  readonly run: TurnRun;
  /** 本轮是否有子代理在跑 */
  readonly subagentBusy?: boolean;
};

/** 该过程组内是否有运行中的工具调用。 */
function hasRunningCall(run: TurnRun): boolean {
  if (run.kind !== 'process') return false;
  return run.blocks.some((block) => block.kind === 'tools' && block.calls.some((call) => call.status === 'running'));
}

export function autoOpenForProcessGroup(input: ProcessGroupInput): boolean {
  return input.subagentBusy === true || hasRunningCall(input.run);
}