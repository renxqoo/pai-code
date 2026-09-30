import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { UsageDetails, formatWindowPct, liveUsageOf } from '../usage-details';

/** 弹层（实时口径）：占用构成三行（系统提示词/工具/消息）+ 剩余/窗口/缓存命中率，
 *  一律占窗口百分比；分项为估算口径但不标注文案。 */
describe('用量明细弹层（占窗口百分比·构成三行）', () => {
  const COMPOSITION = { systemPrompt: 10_000, tools: 20_000 };

  test('三行在场且求和恒等：系统提示词 5% + 工具 10% + 消息（派生）→ 与已用一致', () => {
    // 已用 55k：系统提示词 10k=5%、工具 20k=10%、消息 = 55k−10k−20k = 25k=12.5%
    const html = renderToStaticMarkup(
      <UsageDetails live={{ used: 55_000, window: 200_000 }} cache={{ read: 44_000, input: 55_000 }} composition={COMPOSITION} />,
    );
    expect(html).toContain(copy.usage.contextTitle);
    expect(html).toContain('27.5%'); // 已用 55k/200k
    expect(html).toContain(copy.usage.systemPromptLabel);
    expect(html).toContain('5%');
    expect(html).toContain(copy.usage.toolsLabel);
    expect(html).toContain('10%');
    expect(html).toContain(copy.usage.contextMessagesLabel);
    expect(html).toContain('12.5%'); // 派生：25k/200k
    expect(html).toContain(copy.usage.freeSpaceLabel);
    expect(html).toContain('72.5%');
    expect(html).toContain(copy.usage.windowLabel);
    expect(html).toContain(copy.usage.cacheHitLabel);
    expect(html).toContain('80%');
    // 无「估算」文案、无绝对数 k
    expect(html).not.toContain('估算');
    expect(html).not.toContain('55k');
  });

  test('症状回归：两估之和超实报时消息钳零，但已用与剩余仍自洽（不再出现 已用 5.6%/剩余 0%）', () => {
    // 旧实现：messages 由 hub 给，估算超实报被钳 0；且 remaining 用另一分母 → 自相矛盾。
    // 现在消息在展示层派生（同样钳零，但夹紧只此一处），剩余恒等于 100%−已用。
    const html = renderToStaticMarkup(
      <UsageDetails live={{ used: 11_000, window: 200_000 }} cache={null} composition={{ systemPrompt: 10_000, tools: 20_000 }} />,
    );
    expect(html).toContain('5.5%'); // 已用 11k/200k
    expect(html).toContain('94.5%'); // 剩余 = 100% − 5.5%（不是 0%）
    expect(html).toContain('0%'); // 消息被钳零（唯一夹紧点）
  });

  test('composition 缺席（未拉到）：三行不渲染，其余照常', () => {
    const html = renderToStaticMarkup(<UsageDetails live={{ used: 55_000, window: 200_000 }} cache={null} composition={null} />);
    expect(html).not.toContain(copy.usage.systemPromptLabel);
    expect(html).toContain(copy.usage.freeSpaceLabel);
  });

  test('cache 缺席（无实报）：命中率行不渲染', () => {
    const html = renderToStaticMarkup(<UsageDetails live={{ used: 55_000, window: 200_000 }} cache={null} composition={COMPOSITION} />);
    expect(html).not.toContain(copy.usage.cacheHitLabel);
  });

  test('live 缺席（未发消息/无窗口）：不渲染弹层', () => {
    expect(renderToStaticMarkup(<UsageDetails live={null} cache={null} composition={COMPOSITION} />)).toBe('');
  });

  test('症状回归：窗口非法不显 0%（会被读成真满了）——显 —', () => {
    expect(formatWindowPct(100, 0)).toBe('—');
    expect(formatWindowPct(100, Number.NaN)).toBe('—');
    expect(formatWindowPct(0, 100)).toBe('0%');
  });
});

describe('liveUsageOf 派生（实时 usage × 窗口）', () => {
  const usage = { input: 61_444, output: 10, cacheRead: 61_000, cacheWrite: 0 };

  test('usage + 窗口在场 → { used: 实报 input, window }', () => {
    expect(liveUsageOf(usage, 1_000_000)).toEqual({ used: 61_444, window: 1_000_000 });
  });

  test('症状回归：窗口缺失不算百分比（无分母不给假值）', () => {
    expect(liveUsageOf(usage, null)).toBeNull();
    expect(liveUsageOf(usage, 0)).toBeNull();
  });

  test('usage 缺席（未发消息）→ null', () => {
    expect(liveUsageOf(null, 1_000_000)).toBeNull();
  });
});
