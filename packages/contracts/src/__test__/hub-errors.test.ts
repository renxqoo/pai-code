import { describe, expect, test } from 'bun:test';

import { HUB_ERROR_CODES, isWireError } from '../hub-errors';

/** 码表镜像自检：唯一性 + 形状守卫不验词表成员（未登记 code 必须透传到兜底族）。 */

describe('hub-errors 码表镜像', () => {
  test('码唯一无重复（集合大小 = 数组长度）', () => {
    expect(new Set(HUB_ERROR_CODES).size).toBe(HUB_ERROR_CODES.length);
  });

  test('isWireError 只验形状：未登记 code 也是合法线上错误（不丢）', () => {
    expect(isWireError({ code: 'brand_new_code', message: 'x' })).toBe(true);
    expect(isWireError({ code: 'unknown_thread', message: 'Unknown threadId' })).toBe(true);
    expect(isWireError({ code: 1, message: null })).toBe(false);
    expect(isWireError('Unknown threadId')).toBe(false);
    expect(isWireError(null)).toBe(false);
  });
});
