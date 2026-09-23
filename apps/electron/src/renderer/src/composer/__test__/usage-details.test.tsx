import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { UsageDetails } from '../usage-details';

const STATS = { userMessages: 1, assistantMessages: 2, toolCalls: 3, toolResults: 4, tokens: { input: 1200, output: 340, total: 1540 }, cost: 0.5 };
const ANALYTICS = {
  used: 55_000, window: 200_000, utilizationPct: 28, remaining: 145_000,
  systemPrompt: 2_000, tools: 35_000, messages: 18_000,
  cacheHitRate: 0.8, totalCacheRead: 44_000, totalCacheWrite: 5_000, sessionOutput: 3_000,
};

/** 双口径弹层（T43）：上下文段（估算分项 + 剩余/窗口 + 缓存）与累计段分开命名；
 *  双口径不混排（Codex #3630 混淆教训——累计单调增不冒充上下文）。 */
describe('用量明细弹层双段结构', () => {
  test('analytics 在场：上下文段（分项/剩余/窗口/缓存 + 估算口径声明）+ 累计段同屏', () => {
    const html = renderToStaticMarkup(<UsageDetails stats={STATS} analytics={ANALYTICS} />);
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
    // 估算口径声明在场
    expect(html).toContain(copy.usage.estimateNote);
    // 累计段保留（双口径分开命名）
    expect(html).toContain(copy.usage.cumulativeTitle);
    expect(html).toContain(copy.usage.inputTokens);
    expect(html).toContain('$0.50');
  });

  test('analytics 缺席：只渲染累计段（无上下文段头/估算声明——不摆假数据面）', () => {
    const html = renderToStaticMarkup(<UsageDetails stats={STATS} analytics={null} />);
    expect(html).not.toContain(copy.usage.contextTitle);
    expect(html).not.toContain(copy.usage.estimateNote);
    expect(html).toContain(copy.usage.inputTokens);
    expect(html).toContain(copy.usage.tokensLabel);
  });
});
