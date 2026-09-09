import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TurnAnchorRail } from '../turn-anchor-rail';
import type { TurnAnchorDatum } from '../turn-anchor-data';

const anchors: TurnAnchorDatum[] = [
  { id: 't1', time: '10:46 AM', summary: '修复滚动边界' },
  { id: 't2', time: '11:20 AM', summary: '整页滚动改造' },
  { id: 't3', time: '3:05 PM', summary: '' },
];

/** 渲染冒烟：锚点带按序渲染全部刻痕（nav 无障碍名 + 各条 aria），不足 3 轮不渲染。 */
describe('TurnAnchorRail 渲染', () => {
  test('按顺序渲染全部锚点条目，nav 带无障碍名', () => {
    const html = renderToStaticMarkup(<TurnAnchorRail anchors={anchors} onJump={() => undefined} />);
    expect(html).toContain('aria-label="历史轮次导航"');
    expect(html).toContain('查看 10:46 AM 结束的轮次');
    expect(html.indexOf('10:46 AM')).toBeLessThan(html.indexOf('3:05 PM'));
  });

  test('空锚点数据不渲染任何标记', () => {
    expect(renderToStaticMarkup(<TurnAnchorRail anchors={[]} onJump={() => undefined} />)).toBe('');
  });

  test('锚点不足 3 轮不渲染（短会话不启锚点带）', () => {
    expect(renderToStaticMarkup(<TurnAnchorRail anchors={anchors.slice(0, 2)} onJump={() => undefined} />)).toBe('');
  });

  test('定位：挂主区固定高根（左缘即侧栏右缘）距侧栏 16px，锚点列垂直居中无 sticky，不随页面滚动', () => {
    const html = renderToStaticMarkup(<TurnAnchorRail anchors={anchors} onJump={() => undefined} />);
    expect(html).toContain('left-[16px]');
    expect(html).toContain('items-center');
    expect(html).not.toContain('sticky');
    expect(html).not.toContain('min-[1280px]');
  });
});
