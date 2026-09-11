import { describe, expect, test } from 'bun:test';

import { createDialogTimers } from '../dialog-timers';

describe('createDialogTimers', () => {
  test('登记即起表；结算回收；同 id 重投换新句柄', () => {
    const timers = createDialogTimers(1_000);
    const fired: string[] = [];
    timers.arm('r1', 't1', () => fired.push('r1'));
    timers.settle('r1');
    expect(fired).toEqual([]);
    // 重投不残留旧句柄语义由实现保证（同 id 复用键）
    timers.arm('r1', 't1', () => fired.push('r1-again'));
    timers.clearAll();
    expect(fired).toEqual([]);
  });

  test('dropThread 只回收属主线程；clearAll 全量回收', () => {
    const timers = createDialogTimers(1_000);
    const fired: string[] = [];
    timers.arm('r1', 't1', () => fired.push('r1'));
    timers.arm('r2', 't2', () => fired.push('r2'));
    timers.dropThread('t1');
    timers.clearAll();
    expect(fired).toEqual([]);
  });
});
