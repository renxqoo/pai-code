import { describe, expect, test } from 'bun:test';

import { autoOpenForTurn, chevronRevealClass, resolveOpen } from '../collapse-state';
import type { TurnBlock, TurnStatus } from '../thread-model';

function turn(status: TurnStatus, blocks: readonly TurnBlock[] = []): { status: TurnStatus; blocks: readonly TurnBlock[] } {
  return { status, blocks };
}

describe('autoOpenForTurn', () => {
  test('运行中的轮自动展开', () => {
    expect(autoOpenForTurn(turn('running'))).toBe(true);
  });

  test('正常完成的轮收起为摘要 + 最终文本', () => {
    expect(autoOpenForTurn(turn('completed'))).toBe(false);
  });

  test('症状回归：异常结束的轮不折叠——停止/回收打断、上游报错、中止一律保持展开', () => {
    const failure: TurnBlock = { kind: 'turnFailure', id: 'f', stopReason: 'error', message: 'boom' };
    const aborted: TurnBlock = { kind: 'turnFailure', id: 'f', stopReason: 'aborted', message: null };
    expect(autoOpenForTurn(turn('stopped'))).toBe(true);
    expect(autoOpenForTurn(turn('completed', [failure]))).toBe(true);
    expect(autoOpenForTurn(turn('stopped', [aborted]))).toBe(true);
  });
});

describe('chevronRevealClass（症状回归：点击开→关后箭头常显不隐藏）', () => {
  test('收起态显形只认 hover 与键盘聚焦（focus-visible）——focus-within 会被鼠标点击残留的焦点钉住常显', () => {
    const closed = chevronRevealClass(false);
    expect(closed).toContain('opacity-0');
    expect(closed).toContain('group-hover:opacity-70');
    expect(closed).toContain('group-has-[:focus-visible]:opacity-70');
    expect(closed).not.toContain('group-focus-within');
    expect(closed).not.toContain('focus-within:opacity-70');
  });

  test('展开态常显（开了就要看得见从哪儿收回去），不带任何显形钩子', () => {
    const open = chevronRevealClass(true);
    expect(open).toContain('opacity-70');
    expect(open).not.toContain('opacity-0');
    expect(open).not.toContain('group-hover');
  });
});

describe('resolveOpen', () => {
  test('手动意图优先于自动状态（自动收起不再收回用户展开的过程）', () => {
    expect(resolveOpen(true, false)).toBe(true);
    expect(resolveOpen(false, true)).toBe(false);
  });

  test('未表态时跟随自动状态', () => {
    expect(resolveOpen(null, true)).toBe(true);
    expect(resolveOpen(null, false)).toBe(false);
  });
});
