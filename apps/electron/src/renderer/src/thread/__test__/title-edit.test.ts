import { describe, expect, test } from 'bun:test';

import { reduceTitleEdit, titleCommit, type TitleEditState } from '../title-edit';

describe('reduceTitleEdit', () => {
  test('start/change/cancel 迁移；非编辑态 change/cancel 无操作', () => {
    const idle: TitleEditState = null;
    expect(reduceTitleEdit(idle, { kind: 'start', title: '会话' })).toEqual({ draft: '会话' });
    expect(reduceTitleEdit({ draft: 'a' }, { kind: 'change', value: 'ab' })).toEqual({ draft: 'ab' });
    expect(reduceTitleEdit({ draft: 'a' }, { kind: 'cancel' })).toBeNull();
    expect(reduceTitleEdit(idle, { kind: 'change', value: 'x' })).toBeNull();
    expect(reduceTitleEdit(idle, { kind: 'cancel' })).toBeNull();
    // start 覆盖在编辑中的草稿（重开编辑以当前标题为准）
    expect(reduceTitleEdit({ draft: '旧草稿' }, { kind: 'start', title: '新标题' })).toEqual({ draft: '新标题' });
  });
});

describe('titleCommit', () => {
  test.each([
    [null, '原标题', null],
    [{ draft: '  ' }, '原标题', null],
    [{ draft: '原标题' }, '原标题', null],
    [{ draft: '  新名  ' }, '原标题', { name: '新名' }],
    [{ draft: '新名' }, '其他', { name: '新名' }],
  ])('state=%j original=%s → %j', (state, original, expected) => {
    expect(titleCommit(state as TitleEditState, original as string)).toEqual(expected);
  });
});
