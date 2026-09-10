import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TurnAnchor } from '../turn-anchor';

/** 渲染冒烟：锚点按钮带无障碍名（含时刻），气泡承载时刻 + 摘要；空摘要不落分隔点。 */
describe('TurnAnchor 渲染', () => {
  test('aria 标签含时刻，气泡含时刻与摘要', () => {
    const html = renderToStaticMarkup(
      <TurnAnchor time="10:46 AM" summary="修复滚动边界" onJump={() => undefined} />,
    );
    expect(html).toContain('aria-label="查看 10:46 AM 结束的轮次"');
    expect(html).toContain('10:46 AM');
    expect(html).toContain('修复滚动边界');
  });

  test('摘要为空串时气泡只含时刻，不渲染分隔点', () => {
    const html = renderToStaticMarkup(<TurnAnchor time="3:05 PM" summary="" onJump={() => undefined} />);
    expect(html).toContain('3:05 PM');
    expect(html).not.toContain(' · ');
  });

  test('刻痕默认 14px 短条（bg-border），hover/聚焦动效变长到 22px 并变实（bg-foreground）', () => {
    const html = renderToStaticMarkup(
      <TurnAnchor time="10:46 AM" summary="" onJump={() => undefined} />,
    );
    expect(html).toContain('w-[14px]');
    expect(html).toContain('bg-border');
    expect(html).toContain('group-hover:w-[22px]');
    expect(html).toContain('group-hover:bg-foreground');
    expect(html).toContain('group-focus-visible:w-[22px]');
    expect(html).toContain('group-focus-visible:bg-foreground');
    expect(html).toContain('motion-reduce:transition-none');
  });

  test('长摘要两行封顶省略号收尾，不出现第三行拦腰截断（clamp 层无 padding、气泡层不裁剪）', () => {
    const html = renderToStaticMarkup(
      <TurnAnchor time="8:20 PM" summary="比如继续推进 tasks/ 里的任务、修 bug、写测试，先来看看代码" onJump={() => undefined} />,
    );
    // clamp 在无 padding 内层：overflow 裁剪发生在 padding 盒边缘，带 padding 的层裁剪会漏出下一行字形上沿
    expect(html).toContain('line-clamp-2 block max-w-[280px]');
    // 气泡外观层不承担裁剪：禁 max-height 硬截与 overflow 裁剪
    expect(html).not.toContain('max-h-');
    expect(html).not.toContain('overflow-hidden');
  });
});
