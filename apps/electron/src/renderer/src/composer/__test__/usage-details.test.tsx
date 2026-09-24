import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { UsageDetails } from '../usage-details';

const ANALYTICS = {
  used: 55_000, window: 200_000, utilizationPct: 28, remaining: 145_000,
  systemPrompt: 2_000, tools: 35_000, messages: 18_000,
  cacheHitRate: 0.8, totalCacheRead: 44_000, totalCacheWrite: 5_000, sessionOutput: 3_000,
};

/** 上下文段弹层（T43）：构成分项估算 + 剩余/窗口 + 缓存观测 + 估算口径声明；
 *  累计段已下线——双口径不混排（Codex #3630 混淆教训），弹层只保留估算口径一面。 */
describe('用量明细弹层上下文段', () => {
  test('analytics 在场：上下文段（分项/剩余/窗口/缓存 + 估算口径声明）', () => {
    const html = renderToStaticMarkup(<UsageDetails analytics={ANALYTICS} />);
    // 上下文段头：标题 + 已用/窗口绝对数
    expect(html).toContain(copy.usage.contextTitle);
    expect(html).toContain('55k');
    expect(html).toContain('200k');
    // 构成分项（估算口径标签）与缓存观测
    expect(html).toContain(copy.usage.systemPromptLabel);
    expect(html).toContain(copy.usage.toolsLabel);
    expect(html).toContain(copy.usage.contextMessagesLabel);
    expect(html).toContain(copy.usage.freeSpaceLabel);
    expect(html).toContain(copy.usage.cacheHitLabel);
    expect(html).toContain('80%');
    // 估算口径声明在场（分项仍为本地估算口径）
    expect(html).toContain(copy.usage.estimateNote);
  });

  test('analytics 缺席：不渲染弹层（累计段下线后无兜底——不摆假数据面）', () => {
    const html = renderToStaticMarkup(<UsageDetails analytics={null} />);
    expect(html).toBe('');
  });
});
