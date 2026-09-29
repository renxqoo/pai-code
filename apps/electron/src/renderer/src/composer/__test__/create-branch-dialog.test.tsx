import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { fireChange } from '@/testing/change';
import { render } from '@/testing/render';
import { copy } from '@/strings';

import { CreateBranchDialog } from '../create-branch-dialog';

/**
 * 「创建并检出新分支」弹窗：空名禁提交、失败内联不关窗、Esc 关。
 */

type Harness = {
  submits: string[]
  changes: boolean[]
  root: () => HTMLElement
  input: () => HTMLInputElement
  button: (label: string) => HTMLButtonElement | undefined
  formSubmit: () => void
  unmount: () => void
};

function mount(over: Partial<Parameters<typeof CreateBranchDialog>[0]> = {}): Harness {
  const submits: string[] = [];
  const changes: boolean[] = [];
  const view = render(
    <CreateBranchDialog
      open
      onOpenChange={(open) => changes.push(open)}
      busy={false}
      error={null}
      onSubmit={(branch) => submits.push(branch)}
      {...over}
    />,
  );
  // 取最新挂载的弹窗（前序用例断言失败未卸载时，旧弹窗仍留 body——取末位防串）
  const root = (): HTMLElement => {
    const node = [...document.body.querySelectorAll('[role="dialog"]')].at(-1);
    if (node === undefined) throw new Error('弹窗未挂载');
    return node as HTMLElement;
  };
  return {
    submits,
    changes,
    root,
    input: () => root().querySelector('input') as HTMLInputElement,
    button: (label: string) =>
      [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined,
    formSubmit: () => {
      root().querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    },
    unmount: view.unmount,
  };
}

describe('CreateBranchDialog', () => {
  test('标题/提交按钮走「创建并切换」；提交带裁剪后的分支名', () => {
    const h = mount();
    expect(h.root().textContent ?? '').toContain(copy.branch.createTitle);
    expect(h.root().textContent ?? '').toContain(copy.branch.createHelper);
    expect(h.button(copy.branch.createSubmit)).toBeDefined();
    fireChange(h.input(), '  feat/new  ');
    h.formSubmit();
    expect(h.submits).toEqual(['feat/new']);
    h.unmount();
  });

  test('空名禁提交（按钮禁用 + 表单守卫双保险）', () => {
    const h = mount();
    expect(h.button(copy.branch.createSubmit)?.hasAttribute('disabled')).toBe(true);
    h.formSubmit();
    expect(h.submits).toEqual([]);
    h.unmount();
  });

  test('失败原因内联呈现且字段标 invalid（改名重试不关窗）', () => {
    const h = mount({ error: '分支已存在' });
    expect(h.root().textContent ?? '').toContain('分支已存在');
    expect(h.input().getAttribute('aria-invalid')).toBe('true');
    h.formSubmit();
    expect(h.changes).toEqual([]);
    h.unmount();
  });

  test('busy：提交不回调且输入/按钮禁用；Esc 自行消费关闭', () => {
    const h = mount({ busy: true });
    expect(h.input().hasAttribute('disabled')).toBe(true);
    expect(h.button(copy.branch.createSubmit)?.hasAttribute('disabled')).toBe(true);
    h.formSubmit();
    expect(h.submits).toEqual([]);
    h.unmount();

    const esc = mount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(esc.changes).toEqual([false]);
    esc.unmount();
  });
});
