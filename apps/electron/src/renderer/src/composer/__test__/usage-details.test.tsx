import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { UsageDetails } from '../usage-details';

const ANALYTICS = {
  used: 55_000, window: 200_000, utilizationPct: 28, remaining: 145_000,
  systemPrompt: 2_000, tools: 35_000, messages: 18_000,
  cacheHitRate: 0.8, totalCacheRead: 44_000, totalCacheWrite: 5_000, sessionOutput: 3_000,
};

/** 上下文段弹层（T43）：分项/剩余/窗口一律按占窗口百分比展示 + 缓存观测；
 *  累计段暂以代码注释保留（双口径不混排——Codex #3630 混淆教训），k 绝对数与估算文案不再渲染。 */
describe('用量明细弹层上下文段', () => {
  test('analytics 在场：上下文段（分项/剩余/窗口占比 + 缓存观测，无估算文案）', () => {
    const html = renderToStaticMarkup(<UsageDetails analytics={ANALYTICS} />);
    // 上下文段头：标题 + 已用占窗口比（55k/200k = 27.5%）
    expect(html).toContain(copy.usage.contextTitle);
    expect(html).toContain('27.5%');
    expect(html).toContain('17.5%'); // 工具 35k/200k
    expect(html).toContain('72.5%'); // 剩余 145k/200k
    expect(html).toContain('100%'); // 上下文窗口（分母自身）
    // 构成分项与缓存观测
    expect(html).toContain(copy.usage.systemPromptLabel);
    expect(html).toContain(copy.usage.toolsLabel);
    expect(html).toContain(copy.usage.contextMessagesLabel);
    expect(html).toContain(copy.usage.freeSpaceLabel);
    expect(html).toContain(copy.usage.cacheHitLabel);
    expect(html).toContain('80%');
    // k 绝对数、估算口径文案、累计段都不渲染
    expect(html).not.toContain('55k');
    expect(html).not.toContain('200k');
    expect(html).not.toContain('估算');
    expect(html).not.toContain(copy.usage.cacheReadLabel);
    expect(html).not.toContain(copy.usage.cacheWriteLabel);
  });

  test('analytics 缺席：不渲染弹层（累计段下线后无兜底——不摆假数据面）', () => {
    const html = renderToStaticMarkup(<UsageDetails analytics={null} />);
    expect(html).toBe('');
  });
});
