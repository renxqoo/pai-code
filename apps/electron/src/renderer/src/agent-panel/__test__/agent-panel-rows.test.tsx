import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { ToolCallModel } from '@/thread/thread-model';
import { render } from '@/testing/render';
import { fireChange, fireKeyDown } from '@/testing/change';
import { copy } from '@/strings';

import { AgentToolRow } from '../agent-tool-row';
import { SteerInput } from '../steer-input';

/** 子代理面板行件：steer 输入（Enter 提交/IME 放行/空串不发）与工具明细行（四态呈现）。 */

function call(over: Partial<ToolCallModel> = {}): ToolCallModel {
  return {
    id: 'c1',
    name: 'Bash',
    argsPreview: 'ls -la',
    subagents: [],
    editHunks: [],
    output: '',
    exitCode: 0,
    durationMs: 1200,
    status: 'done',
    ...over,
  };
}

describe('SteerInput', () => {
  test('Enter 提交 trim 后清空；空串与 IME 组合期不发', () => {
    const seen: string[] = [];
    const view = render(<SteerInput onSubmit={(message) => seen.push(message)} />);
    const input = view.container.querySelector('input') as HTMLInputElement;
    fireChange(input, '  做点别的  ');
    fireKeyDown(input, 'Enter');
    expect(seen).toEqual(['做点别的']);
    expect(input.value).toBe('');

    fireKeyDown(input, 'Enter');
    fireChange(input, 'IME 期提交');
    fireKeyDown(input, 'Enter', true);
    expect(seen).toEqual(['做点别的']);
    view.unmount();
  });

  test('占位文案与提交图标（输入 affordance 呈现面）', () => {
    const view = render(<SteerInput onSubmit={() => undefined} />);
    expect((view.container.querySelector('input') as HTMLInputElement).getAttribute('placeholder')).toBe(copy.flow.steerPlaceholder);
    expect(view.container.textContent ?? '').not.toContain(copy.flow.steerPlaceholder);
    view.unmount();
  });
});

describe('AgentToolRow', () => {
  test('running → 脉冲点（可读标签）；stopped → 终止标签', () => {
    const running = render(<AgentToolRow call={call({ status: 'running', durationMs: null, exitCode: null })} />);
    expect(running.container.textContent ?? '').toContain('ls -la');
    expect(running.container.querySelector('[aria-label="' + copy.flow.toolRunning + '"]')).not.toBeNull();
    running.unmount();

    const stopped = render(<AgentToolRow call={call({ status: 'stopped', durationMs: null, exitCode: null })} />);
    expect(stopped.container.textContent ?? '').toContain(copy.flow.toolStopped);
    stopped.unmount();
  });

  test('done/failed → 等宽耗时（失败红）；无耗时不上耗时标', () => {
    const done = render(<AgentToolRow call={call({ status: 'done', durationMs: 1200 })} />);
    expect(done.container.textContent ?? '').toContain('ls -la');
    expect(done.container.textContent ?? '').not.toContain(copy.flow.toolStopped);
    done.unmount();

    const failed = render(<AgentToolRow call={call({ status: 'failed', durationMs: null, exitCode: 1 })} />);
    expect(failed.container.textContent ?? '').not.toContain(copy.flow.toolRunning);
    failed.unmount();
  });
});
