import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AnchoredPanel } from '../anchored-panel';

/** 锚定面板底座（SSR 关态面）：关 = 卸载——只渲染触发器，面板内容零渲染；触发器元素自身属性保留。 */
describe('AnchoredPanel', () => {
  test('关闭态：仅渲染触发器，内容与可访问名不进 DOM', () => {
    const html = renderToStaticMarkup(
      <AnchoredPanel
        open={false}
        onOpenChange={() => undefined}
        trigger={<button type="button" aria-label="切换分支">main</button>}
        label="分支面板"
      >
        <p>面板内容</p>
      </AnchoredPanel>,
    );
    expect(html).toContain('aria-label="切换分支"');
    expect(html).toContain('main');
    expect(html).not.toContain('面板内容');
    expect(html).not.toContain('分支面板');
  });
});
