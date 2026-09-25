import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { CircularProgressButton } from '@/components/ui/circular-progress-button';
import { PermissionButton } from '@/components/ui/permission-button';
import { TestWrapper } from '@/test/test-wrapper';

describe('composer icon controls', () => {
  it('clamps and renders circular progress values', async () => {
    const press = jest.fn();
    const low = await render(<TestWrapper><CircularProgressButton accessibilityLabel="上下文已使用 24%" onPress={press} value={-4} /></TestWrapper>);
    expect(low.getByText('0')).toBeTruthy();
    expect(low.getByLabelText('上下文已使用 24%').props.style).toMatchObject({ height: 34, width: 34 });
    expect(low.getByText('0').props.style).toMatchObject({ fontSize: 5 });
    await fireEvent.press(low.getByLabelText('上下文已使用 24%'));
    expect(press).toHaveBeenCalledTimes(1);
    const high = await render(<TestWrapper><CircularProgressButton accessibilityLabel="上下文已使用 100%" onPress={press} value={150} /></TestWrapper>);
    expect(high.getByText('100')).toBeTruthy();
    expect(high.getByLabelText('上下文已使用 100%').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
  });

  it.each([
    ['ask', '每次询问'],
    ['auto', '自动批准'],
    ['plan', '仅规划'],
  ] as const)('labels %s permission mode', async (mode, label) => {
    const press = jest.fn();
    const view = await render(<TestWrapper><PermissionButton mode={mode} onPress={press} /></TestWrapper>);
    expect(view.getByLabelText(`权限模式：${label}`)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`权限模式：${label}`));
    expect(press).toHaveBeenCalledTimes(1);
  });
});
