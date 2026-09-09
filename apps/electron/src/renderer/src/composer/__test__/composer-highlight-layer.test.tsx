import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ComposerHighlightLayer } from '../composer-highlight-layer';

const METRICS = 'px-4 pt-[17px] pb-1 text-[12.5px] leading-[19px]';
const RANGE = [{ start: 0, end: 13, source: 'skill' as const }];

function renderLayer(scrollTop = 0): string {
  return renderToStaticMarkup(
    <ComposerHighlightLayer text="/skill:writer 写一段" ranges={RANGE} scrollTop={scrollTop} metricsClassName={METRICS} />,
  );
}

describe('ComposerHighlightLayer', () => {
  test('底色带方案：镜像文字全透明只占位，命中段画半透明色带；aria-hidden 纯装饰', () => {
    const html = renderLayer();
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('pointer-events-none')
    // 镜像层文字透明（不产生可见文字——textarea 原生文字才是可见层）
    expect(html).toContain('text-transparent')
    // 命中段为底色带而非改字色/字重（textarea 与 div 字形位置存在亚像素差，
    // 文字层镜像无法像素对齐，只有底色带可容忍 1-2px 误差）
    expect(html).toContain('bg-dot-active/15')
    expect(html).toContain('rounded-[5px]')
    expect(html).toContain('/skill:writer')
    // 排版度量与 textarea 共用同一份常量
    expect(html).toContain('leading-[19px]')
  })

  test('滚动偏移随 scrollTop 平移，超长输入滚动后保持对齐', () => {
    expect(renderLayer(24)).toContain('translateY(-24px)')
  })
})
