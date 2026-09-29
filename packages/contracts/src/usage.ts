/**
 * usage 的唯一形状与唯一收窄实现。
 *
 * 此前同一事实在仓库里定义了四处（hub-events 的内联字面类型、ui-events 的
 * UsageViewSchema、api 的 HistoryItem 内联 zod、以及 event-mapper / entries-mapper
 * 两份逐字重复的 usageOf），四处一致地只留 { input, output }，把内核明明带上的
 * cacheRead / cacheWrite 全部丢掉——缓存命中率因此永远算不出来（分母在、分子没了）。
 * 四处形状相同，所以读代码看不出哪里不对，只有拿内核字面量对拍才暴露。
 *
 * 对齐内核（x-harness `packages/llm`）：`TokenUsage` 是 cacheRead/cacheWrite
 * 必填、totalTokens/cost 仅在 >0 时携带（`pi-events.ts` foldUsage 的构造）；
 * WAL 侧同形（assistant/message 的 usage）。照抄该口径，不再自行裁剪。
 *
 * 口径（两条一次说清）：
 * 1. **必填四件**：input / output / cacheRead / cacheWrite。input 已含 cache 读与
 *    写（上游 foldUsage 的 input = 原生 input + cacheRead + cacheWrite）——cache
 *    两字段是 input 的子集明细，**不是加数**，消费方不得再相加。
 * 2. **可选两件**：totalTokens / cost。上游只在 >0 时携带，缺席即无观测，
 *    不当 0 也不补零。
 */

import { z } from 'zod';

export const UsageCostSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  total: z.number(),
});
export type UsageCost = z.infer<typeof UsageCostSchema>;

export const UsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  /** 缓存命中 token（input 子集明细——非加数） */
  cacheRead: z.number(),
  /** 缓存写入 token（input 子集明细——非加数） */
  cacheWrite: z.number(),
  totalTokens: z.number().optional(),
  cost: UsageCostSchema.optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

/** 非负有限数才取（NaN/Infinity/负数/非数 → 缺席）。 */
function optionalToken(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** 可选嵌套对象收窄（cost 整块垃圾则缺席——不产半个 cost）。 */
function costOf(value: unknown): UsageCost | undefined {
  if (value === undefined) return undefined;
  const c = recordOf(value);
  const input = optionalToken(c['input']);
  const output = optionalToken(c['output']);
  const cacheRead = optionalToken(c['cacheRead']);
  const cacheWrite = optionalToken(c['cacheWrite']);
  const total = optionalToken(c['total']);
  if (input === undefined || output === undefined || cacheRead === undefined || cacheWrite === undefined || total === undefined) {
    return undefined;
  }
  return { input, output, cacheRead, cacheWrite, total };
}

/**
 * 内核/WAL usage → 视图 usage 的唯一收窄（event-mapper 与 entries-mapper 共用）。
 *
 * `input` / `output` 是判别核心：任一缺席或非数（含 NaN/Infinity/负数）→ null
 * （该条无 usage 真相，调用方按「无观测」处置，不编造 0）。cache 两字段缺席时
 * 退 0（**明细口径**：总量四件在同一样本里齐备，但历史档案可能早于该字段而只
 * 有 input/output——此时把明细记 0 不污染 input 总量口径）；totalTokens / cost
 * 缺席则透传缺席。
 */
export function usageOf(value: unknown): Usage | null {
  const u = recordOf(value);
  const input = optionalToken(u['input']);
  const output = optionalToken(u['output']);
  if (input === undefined || output === undefined) return null;
  const cacheRead = optionalToken(u['cacheRead']) ?? 0;
  const cacheWrite = optionalToken(u['cacheWrite']) ?? 0;
  const totalTokens = optionalToken(u['totalTokens']);
  const cost = costOf(u['cost']);
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cost !== undefined ? { cost } : {}),
  };
}
