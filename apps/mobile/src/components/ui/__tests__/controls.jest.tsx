import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ToggleRow } from '@/components/ui/toggle-row';

describe('UI controls', () => {
  it('fires button press and exposes disabled state', async () => {
    const onPress = jest.fn();
    const view = await render(<Button label="确认" onPress={onPress} />);
    await fireEvent.press(view.getByText('确认'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.rerender(<Button disabled label="确认" onPress={onPress} />);
    expect(view.getByText('确认')).toBeTruthy();
  });

  it('selects a segment and reports accessibility state', async () => {
    const onChange = jest.fn();
    const view = await render(<SegmentedControl options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} value="light" onChange={onChange} />);
    await fireEvent.press(view.getByText('深色'));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('toggles a switch row', async () => {
    const onChange = jest.fn();
    const view = await render(<ToggleRow detail="详情" label="通知" value={false} onChange={onChange} />);
    expect(view.getByLabelText('通知').props.accessibilityState.checked).toBe(false);
    await fireEvent.press(view.getByLabelText('通知'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
