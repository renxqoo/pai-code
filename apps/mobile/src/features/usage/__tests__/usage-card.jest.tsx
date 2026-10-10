import { render } from '@testing-library/react-native';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import * as React from 'react';
import { UsageCard } from '@/features/usage/usage-card';
import { initializeRelayRuntime } from '@/mobile/relay/runtime';
import { useConversationStore } from '@/store/conversation-store';

const invoke = jest.fn();

function readyBridge(analytics: unknown): void {
  const runtime = initializeRelayRuntime();
  runtime.status = 'ready';
  (runtime.client as unknown as { invoke: unknown }).invoke = invoke;
  invoke.mockImplementation((method: string) => Promise.resolve(method === 'session/tokenAnalytics' ? analytics : { ok: true }));
}

describe('UsageCard', () => {
  beforeEach(() => {
    invoke.mockReset();
    useConversationStore.setState({ activeSessionId: null });
  });

  it('未连接：空态提示，不给任何假占比', async () => {
    const view = await render(<UsageCard />);
    expect(view.getByText('打开一个对话后显示它的上下文占用。')).toBeTruthy();
  });

  it('连接态按 tokenAnalytics 真值出占用与剩余', async () => {
    readyBridge({ ok: true, data: { used: 3200, window: 12800 } });
    useConversationStore.setState({ activeSessionId: 't1' });
    const view = await render(<UsageCard />);
    await view.rerender(<UsageCard />);
    expect(view.getByText('上下文占用')).toBeTruthy();
    expect(view.getByText('3.2K · 25%')).toBeTruthy();
    expect(view.getByText('剩余空间')).toBeTruthy();
  });

  it('无分母（window 缺失）时不算百分比（不给假值）', async () => {
    readyBridge({ ok: true, data: { used: 3200, window: 0 } });
    useConversationStore.setState({ activeSessionId: 't1' });
    const view = await render(<UsageCard />);
    await view.rerender(<UsageCard />);
    expect(view.getByText('打开一个对话后显示它的上下文占用。')).toBeTruthy();
  });
});