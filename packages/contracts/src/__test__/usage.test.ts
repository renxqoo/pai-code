import { describe, expect, test } from 'bun:test';

import { UsageSchema, usageOf } from '../usage';

/** usage 单一真相回归：形状必含 cache 明细（症状：app 镜像只留 input/output，
 *  cacheRead 被丢——缓存命中率分母在、分子永远算不出）。 */
describe('UsageSchema 形状（对齐内核 TokenUsage）', () => {
  test('必填四件：input/output/cacheRead/cacheWrite', () => {
    expect(UsageSchema.parse({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toEqual({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 });
  });

  test('症状回归：缺 cacheRead（旧镜像形态）被拒——不再默默接受丢字段的形状', () => {
    expect(() => UsageSchema.parse({ input: 1, output: 2 })).toThrow();
  });

  test('可选两件：totalTokens / cost 在场透传，缺席不补零', () => {
    const withExtras = UsageSchema.parse({
      input: 1, output: 2, cacheRead: 3, cacheWrite: 4,
      totalTokens: 10,
      cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
    });
    expect(withExtras.totalTokens).toBe(10);
    expect(withExtras.cost?.total).toBe(10);
    expect(UsageSchema.parse({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).not.toHaveProperty('totalTokens');
  });
});

describe('usageOf 唯一收窄（内核/WAL → 视图）', () => {
  test('内核全量样本：cache 明细透传（命中率的分子不再丢）', () => {
    const sample = { input: 10130, output: 310, cacheRead: 896, cacheWrite: 0, totalTokens: 10440 };
    expect(usageOf(sample)).toEqual({ input: 10130, output: 310, cacheRead: 896, cacheWrite: 0, totalTokens: 10440 });
  });

  test('症状回归：cacheRead 在场必须保留（旧收窄器只回 {input, output}）', () => {
    const out = usageOf({ input: 100, output: 5, cacheRead: 90, cacheWrite: 10 });
    expect(out?.cacheRead).toBe(90);
    expect(out?.cacheWrite).toBe(10);
  });

  test('input/output 是判别核心：任一缺席或非数 → null（不编造 0）', () => {
    expect(usageOf(undefined)).toBeNull();
    expect(usageOf('junk')).toBeNull();
    expect(usageOf({ output: 1 })).toBeNull();
    expect(usageOf({ input: 1 })).toBeNull();
    expect(usageOf({ input: Number.NaN, output: 1 })).toBeNull();
    expect(usageOf({ input: 1, output: Number.POSITIVE_INFINITY })).toBeNull();
    expect(usageOf({ input: -1, output: 1 })).toBeNull();
  });

  test('cache 两字段缺席退 0（早于该字段的历史档案：明细记 0，不污染 input 总量口径）', () => {
    expect(usageOf({ input: 10, output: 5 })).toEqual({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });
  });

  test('cache 单字段垃圾 → 该字段退 0，不整样本丢弃', () => {
    expect(usageOf({ input: 10, output: 5, cacheRead: Number.NaN, cacheWrite: 3 })).toMatchObject({ cacheRead: 0, cacheWrite: 3 });
  });

  test('totalTokens / cost 缺席透传缺席；cost 整块垃圾则缺席（不产半个 cost）', () => {
    const bare = usageOf({ input: 1, output: 2, cacheRead: 0, cacheWrite: 0 });
    expect(bare).not.toHaveProperty('totalTokens');
    expect(bare).not.toHaveProperty('cost');
    expect(usageOf({ input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: { total: 5 } })).not.toHaveProperty('cost');
  });

  test('cost 齐备则整块透传', () => {
    const cost = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 };
    expect(usageOf({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost })?.cost).toEqual(cost);
  });

  test('垃圾输入降级不崩（数组 / null / 嵌套垃圾）', () => {
    expect(usageOf([1, 2])).toBeNull();
    expect(usageOf(null)).toBeNull();
    expect(usageOf({ input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 'junk' })).not.toHaveProperty('cost');
  });
});
