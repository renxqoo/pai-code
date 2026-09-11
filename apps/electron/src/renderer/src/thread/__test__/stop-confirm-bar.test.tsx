import { describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { StopConfirmBar } from '../stop-confirm-bar';
import { render } from '@/testing/render';

/** 停止确认条两出口编排：确认=停+关条、取消=关条（编排接线在 workspace-main 内联，此处钉行为面）。 */

describe('StopConfirmBar', () => {
  test('确认/取消按钮分别派发（不可恢复停止的二次确认）', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const view = render(<StopConfirmBar onConfirm={onConfirm} onCancel={onCancel} />);
    const buttons = [...view.container.querySelectorAll('button')];
    React.act(() => {
      buttons.find((b) => b.textContent === '全部停止')?.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    React.act(() => {
      buttons.find((b) => b.textContent === '取消')?.click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
