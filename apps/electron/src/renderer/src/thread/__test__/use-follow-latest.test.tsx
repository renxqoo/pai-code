import { beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { useFollowLatest } from '../use-follow-latest';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

/**
 * 发送回底信号消费回归（threadId 寻址一次性）：命中当前活跃线程才回底，
 * 每个信号只消费一次（重渲/切线程不重放）；非本线程的发送不拉走阅读位置。
 */

function Host({ calls, scroll }: { calls: string[]; scroll: () => void }): React.JSX.Element {
  useFollowLatest(scroll);
  calls.push('render');
  return <div />;
}

function bottomCalls(calls: string[]): string[] {
  return calls.filter((entry) => entry === 'bottom');
}

beforeEach(() => {
  installDom();
  uiStore.getState().reset();
  liveStore.getState().reset();
});

describe('useFollowLatest', () => {
  test('发送回底：信号命中活跃线程即回底一次，重渲不重放', () => {
    liveStore.setState({ activeThreadId: 't1' });
    const calls: string[] = [];
    const view = render(<Host calls={calls} scroll={() => calls.push('bottom')} />);
    expect(bottomCalls(calls)).toEqual([]);

    React.act(() => {
      uiStore.getState().requestFollowLatest('t1');
    });
    expect(bottomCalls(calls)).toEqual(['bottom']);

    view.rerender(<Host calls={calls} scroll={() => calls.push('bottom')} />);
    expect(bottomCalls(calls)).toEqual(['bottom']);
    view.unmount();
  });

  test('非本线程的发送不拉走阅读位置：切回该线程才回底，且仍只一次', () => {
    liveStore.setState({ activeThreadId: 't2' });
    const calls: string[] = [];
    const view = render(<Host calls={calls} scroll={() => calls.push('bottom')} />);
    React.act(() => {
      uiStore.getState().requestFollowLatest('t1');
    });
    expect(bottomCalls(calls)).toEqual([]);

    React.act(() => {
      liveStore.setState({ activeThreadId: 't1' });
    });
    expect(bottomCalls(calls)).toEqual(['bottom']);
    view.rerender(<Host calls={calls} scroll={() => calls.push('bottom')} />);
    expect(bottomCalls(calls)).toEqual(['bottom']);
    view.unmount();
  });

  test('挂载时现存信号视为历史（种子式消费）：不重放旧信号，新信号正常消费', () => {
    liveStore.setState({ activeThreadId: 't1' });
    uiStore.getState().requestFollowLatest('t1'); // 挂载前的旧信号
    const calls: string[] = [];
    const view = render(<Host calls={calls} scroll={() => calls.push('bottom')} />);
    expect(bottomCalls(calls)).toEqual([]);

    React.act(() => {
      uiStore.getState().requestFollowLatest('t1');
    });
    expect(bottomCalls(calls)).toEqual(['bottom']);
    view.unmount();
  });

  test('分批信号各回底一次；同批多信号合并为一次回底（意图幂等）', () => {
    liveStore.setState({ activeThreadId: 't1' });
    const calls: string[] = [];
    const view = render(<Host calls={calls} scroll={() => calls.push('bottom')} />);
    React.act(() => {
      uiStore.getState().requestFollowLatest('t1');
    });
    React.act(() => {
      uiStore.getState().requestFollowLatest('t1');
    });
    expect(bottomCalls(calls)).toEqual(['bottom', 'bottom']);

    // 同一渲染周期内连发多条：回底意图按次不必重复反应，合并为一次
    React.act(() => {
      uiStore.getState().requestFollowLatest('t1');
      uiStore.getState().requestFollowLatest('t1');
    });
    expect(bottomCalls(calls)).toEqual(['bottom', 'bottom', 'bottom']);
    view.unmount();
  });
});
