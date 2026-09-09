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
  test('镜像层渲染可见文本：命中段高亮（dot-active + medium），其余普通；aria-hidden 纯装饰', () => {
    const html = renderLayer();
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('pointer-events-none')
    expect(html).toContain('text-dot-active')
    expect(html).toContain('/skill:writer')
    expect(html).toContain('写一段')
    // 排版度量与 textarea 共用同一份常量
    expect(html).toContain('leading-[19px]')
  })

  test('滚动偏移随 scrollTop 平移，超长输入滚动后保持对齐', () => {
    expect(renderLayer(24)).toContain('translateY(-24px)')
  })
})
