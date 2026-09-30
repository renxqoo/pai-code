import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { UsageDetails, formatWindowPct, liveUsageOf } from '../usage-details';

/** 弹层（实时口径）：只列真值行（剩余/窗口/缓存命中率）。
 *  估算分项已删——估算归 token-meter，展示层不自算残差。 */
describe('用量明细弹层（实时口径·只列真值行）', () => {
  test('live 在场：剩余/窗口占比 + 缓存命中率；估算分项与绝对数不出现', () => {
    const html = renderToStaticMarkup(
      <UsageDetails live={{ used: 55_000, window: 200_000 }} cache={{ read: 44_000, input: 55_000 }} />,
    );
    // 段头：标题 + 已用占窗口比（55k/200k = 27.5%）
    expect(html).toContain(copy.usage.contextTitle);
    expect(html).toContain('27.5%');
    // 真值行：剩余 145k/200k = 72.5%；窗口 100%；命中率 80%
    expect(html).toContain(copy.usage.freeSpaceLabel);
    expect(html).toContain('72.5%');
    expect(html).toContain(copy.usage.windowLabel);
    expect(html).toContain('100%');
    expect(html).toContain(copy.usage.cacheHitLabel);
    expect(html).toContain('80%');
    // 估算分项已下线（残差口径自相矛盾）——labels 已从 strings 删除，
    // 此处按字面断言这些行不再出现
    expect(html).not.toContain('系统提示词');
    expect(html).not.toContain('消息');
    expect(html).not.toContain('>工具<');
    expect(html).not.toContain('估算');
    expect(html).not.toContain('55k');
    expect(html).not.toContain('200k');
  });

  test('cache 缺席（无实报）：命中率行不渲染，其余真值行照常', () => {
    const html = renderToStaticMarkup(<UsageDetails live={{ used: 55_000, window: 200_000 }} cache={null} />);
    expect(html).not.toContain(copy.usage.cacheHitLabel);
    expect(html).toContain(copy.usage.freeSpaceLabel);
  });

  test('live 缺席（未发消息/无窗口）：不渲染弹层（不摆假数据面）', () => {
    expect(renderToStaticMarkup(<UsageDetails live={null} cache={null} />)).toBe('');
  });

  test('症状回归：窗口非法不显 0%（0% 会被读成真满了）——显 —', () => {
    expect(formatWindowPct(100, 0)).toBe('—');
    expect(formatWindowPct(100, Number.NaN)).toBe('—');
    expect(formatWindowPct(0, 100)).toBe('0%'); // 真 0 才显 0%
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
