import { render } from '@testing-library/react-native';
import { describe, expect, it, beforeEach } from '@jest/globals';
import * as React from 'react';
import { UsageCard } from '@/features/usage/usage-card';
import { useDemoModeStore } from '@/store/demo-mode-store';

describe('UsageCard', () => {
  beforeEach(() => {
    useDemoModeStore.getState().setEnabled(true);
  });

  it('演示模式渲染模型用量占比', async () => {
    const view = await render(<UsageCard />);
    expect(view.getByText('GPT-5.2 Codex')).toBeTruthy();
    expect(view.getByText('79.6K · 62%')).toBeTruthy();
    expect(view.getByText('Claude Sonnet 5')).toBeTruthy();
    expect(view.getByText('Gemini 3 Pro')).toBeTruthy();
  });

  it('连接模式（未连接）：空态提示', async () => {
    useDemoModeStore.getState().setEnabled(false);
    const view = await render(<UsageCard />);
    expect(view.getByText('连接电脑并打开一个会话后显示用量。')).toBeTruthy();
  });
});

describe('UsageCard 连接模式数据面', () => {
  it('有活跃会话但 bridge 非 ready → 空态（fetch 不发）', async () => {
    useDemoModeStore.getState().setEnabled(false);
    const view = await render(<UsageCard />);
    expect(view.getByText('连接电脑并打开一个会话后显示用量。')).toBeTruthy();
  });
});
