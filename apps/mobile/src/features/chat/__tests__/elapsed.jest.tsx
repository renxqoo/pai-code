import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, cleanup, render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';
import { formatElapsed } from '@/features/chat/format-elapsed';
import { useElapsedNow } from '@/features/chat/use-elapsed-now';

describe('formatElapsed', () => {
  it('formats seconds and minutes at boundaries and degrades garbage safely', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(29_000)).toBe('29s');
    expect(formatElapsed(59_000)).toBe('59s');
    expect(formatElapsed(60_000)).toBe('1m 0s');
    expect(formatElapsed(76_000)).toBe('1m 16s');
    expect(formatElapsed(Number.NaN)).toBeNull();
    expect(formatElapsed(-5)).toBeNull();
  });
});

type ProbeProps = { on: boolean };

function ElapsedProbe({ on }: ProbeProps) {
  return <Text testID="snapshot">{String(useElapsedNow(on))}</Text>;
}

describe('useElapsedNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('ticks the snapshot while active', async () => {
    const view = await render(<ElapsedProbe on />);
    const initial = Number(view.getByTestId('snapshot').props.children);
    await act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(Number(view.getByTestId('snapshot').props.children)).toBe(initial + 2_000);
  });

  it('keeps the snapshot frozen while inactive', async () => {
    const view = await render(<ElapsedProbe on={false} />);
    const initial = Number(view.getByTestId('snapshot').props.children);
    await act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(Number(view.getByTestId('snapshot').props.children)).toBe(initial);
  });

  it('registers an interval only while active and clears it on unmount', async () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
    const idle = await render(<ElapsedProbe on={false} />);
    await idle.unmount();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    const active = await render(<ElapsedProbe on />);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    await active.unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
