import { describe, expect, test } from 'bun:test';

import { copy } from '@/strings';

import { switchBlockedReason } from '../branch-switch-guard';

describe('switchBlockedReason（点击时检查——行不禁用）', () => {
  test('锁定：反馈锁因（含运行会话数）', () => {
    expect(switchBlockedReason(true, 3)).toBe(copy.branch.lockReason(3));
  });

  test('未锁 → null（脏区不在这里拦，verb 恒重评）', () => {
    expect(switchBlockedReason(false, 0)).toBeNull();
  });
});
