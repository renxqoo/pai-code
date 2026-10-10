import { afterEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import type { SessionStatsView, SessionView } from '@x3code/contracts';

import { render } from '@/testing/render';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { formatTokenCount } from '@x3code/ui';
import { copy } from '@/strings';

import { UsageScreen } from '../usage-screen';

/**
 * Usage 全屏页（I2）：汇总卡 + 按项目分组 + Top 会话；空态不摆假数据。
 * 数据 = 本次运行活跃会话（sessions × stats），补拉动作在挂载 effect（单测桩掉）。
 */

function session(threadId: string, cwd: string, title: string): SessionView {
  return {
    threadId,
    cwd,
    sessionPath: `${cwd}/s/${threadId}.jsonl`,
    title,
    state: 'live',
    streaming: false,
    model: 'glm/glm-5.3',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
}

function stats(total: number, cost: number): SessionStatsView {
  return { userMessages: 1, assistantMessages: 2, toolCalls: 3, tokens: { input: 0, output: 0, total }, cost };
}

afterEach(() => {
  jest.restoreAllMocks();
  liveStore.getState().reset();
});

describe('UsageScreen', () => {
  test('空态：汇总归零 + 空文案 + 提示句；关闭回调', () => {
    jest.spyOn(workspaceActions, 'refreshAllStats').mockImplementation(() => undefined);
    let closed = 0;
    const view = render(<UsageScreen onClose={() => { closed += 1; }} />);
    const text = view.container.textContent ?? '';
    expect(text).toContain(copy.usage.title);
    expect(text).toContain(copy.usage.empty);
    expect(text).toContain(copy.usage.liveOnlyHint);
    expect(text).toContain('$0.00');
    [...view.container.querySelectorAll('button')].find((b) => b.textContent?.trim() === copy.usage.close)?.click();
    expect(closed).toBe(1);
    view.unmount();
  });

  test('数据面：汇总合计 + 按项目分组 + Top 会话按 tokens 排序', () => {
    jest.spyOn(workspaceActions, 'refreshAllStats').mockImplementation(() => undefined);
    liveStore.setState({
      sessions: {
        t1: session('t1', '/w/app', '会话甲'),
        t2: session('t2', '/w/app', '会话乙'),
        t3: session('t3', '/w/cli', '会话丙'),
      },
      stats: { t1: stats(5200, 1.25), t2: stats(100, 0.5), t3: stats(3000, 2) },
    });
    const view = render(<UsageScreen onClose={() => undefined} />);
    const text = view.container.textContent ?? '';
    expect(text).toContain(copy.usage.byProject);
    expect(text).toContain(copy.usage.topSessions);
    expect(text).toContain('会话甲');
    expect(text).toContain('会话乙');
    expect(text).toContain('会话丙');
    // 汇总 = 5200+100+3000；分组合计按项目聚合；Top 会话按 tokens 降序（甲 → 丙 → 乙）
    expect(text).toContain(String(formatTokenCount(8300) ?? ''));
    expect(text).toContain('$3.75');
    const topSection = text.slice(text.indexOf(copy.usage.topSessions));
    const order = ['会话甲', '会话丙', '会话乙'].map((title) => topSection.indexOf(title));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[1] as number).toBeGreaterThan(order[0] as number);
    expect(order[2] as number).toBeGreaterThan(order[1] as number);
    view.unmount();
  });
});
