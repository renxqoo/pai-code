import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

import { TurnAnchorRail } from '../turn-anchor-rail';
import type { TurnAnchorDatum } from '../turn-anchor-data';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

const anchors: TurnAnchorDatum[] = [
  { id: 't1', time: '10:46 AM', summary: '修复滚动边界' },
  { id: 't2', time: '11:20 AM', summary: '整页滚动改造' },
  { id: 't3', time: '3:05 PM', summary: '' },
];

/** 渲染冒烟：锚点带按序渲染窗口内刻痕（nav 无障碍名 + 各条 aria），不足 3 轮不渲染。 */
describe('TurnAnchorRail 渲染', () => {
  test('按顺序渲染全部锚点条目，nav 带无障碍名', () => {
    const html = renderToStaticMarkup(<TurnAnchorRail anchors={anchors} currentIndex={0} onJump={() => undefined} />);
    expect(html).toContain('aria-label="历史轮次导航"');
    expect(html).toContain('查看 10:46 AM 结束的轮次');
    expect(html.indexOf('10:46 AM')).toBeLessThan(html.indexOf('3:05 PM'));
  });

  test('空锚点数据不渲染任何标记', () => {
    expect(renderToStaticMarkup(<TurnAnchorRail anchors={[]} currentIndex={0} onJump={() => undefined} />)).toBe('');
  });

  test('锚点不足 3 轮不渲染（短会话不启锚点带）', () => {
    expect(renderToStaticMarkup(<TurnAnchorRail anchors={anchors.slice(0, 2)} currentIndex={0} onJump={() => undefined} />)).toBe('');
  });

  test('定位：挂主区固定高根（左缘即侧栏右缘）距侧栏 16px，锚点列垂直居中无 sticky，不随页面滚动', () => {
    const html = renderToStaticMarkup(<TurnAnchorRail anchors={anchors} currentIndex={0} onJump={() => undefined} />);
    expect(html).toContain('left-[16px]');
    expect(html).toContain('items-center');
    expect(html).not.toContain('sticky');
    expect(html).not.toContain('min-[1280px]');
  });
});

describe('TurnAnchorRail 刻痕窗口化（T55）', () => {
  const many: TurnAnchorDatum[] = Array.from({ length: 50 }, (_, i) => ({
    id: `t${i}`,
    time: `${i}点`,
    summary: `第${i}轮`,
  }));

  test('症状回归「50 轮会话锚点带刻痕挤满栏沟」：同屏最多 21 个刻痕 = 当前轮 ±10', () => {
    const html = renderToStaticMarkup(<TurnAnchorRail anchors={many} currentIndex={19} onJump={() => undefined} />);
    const ticks = html.match(/结束的轮次/g) ?? [];
    expect(ticks).toHaveLength(21);
    expect(html).toContain('查看 9点 结束的轮次');
    expect(html).toContain('查看 29点 结束的轮次');
    expect(html).not.toContain('查看 8点 结束的轮次');
    expect(html).not.toContain('查看 30点 结束的轮次');
  });

  test('总锚点 ≤21 全量展示（不足按具体数量全展示）', () => {
    const short = many.slice(0, 21);
    const html = renderToStaticMarkup(<TurnAnchorRail anchors={short} currentIndex={7} onJump={() => undefined} />);
    const ticks = html.match(/结束的轮次/g) ?? [];
    expect(ticks).toHaveLength(21);
  });

  test('症状回归「滚动到底部刻痕数缩水」：贴顶/贴尾平移补满恒 21 个（用户裁决 2026-09-28）', () => {
    const atTop = renderToStaticMarkup(<TurnAnchorRail anchors={many} currentIndex={0} onJump={() => undefined} />);
    expect(atTop.match(/结束的轮次/g) ?? []).toHaveLength(21);
    expect(atTop).toContain('查看 20点 结束的轮次');
    expect(atTop).not.toContain('查看 21点 结束的轮次');
    const atBottom = renderToStaticMarkup(<TurnAnchorRail anchors={many} currentIndex={49} onJump={() => undefined} />);
    expect(atBottom.match(/结束的轮次/g) ?? []).toHaveLength(21);
    expect(atBottom).toContain('查看 29点 结束的轮次');
    expect(atBottom).not.toContain('查看 28点 结束的轮次');
  });
});

describe('TurnAnchorRail 焦点连续性（T55 窗口滑动不得断键盘位）', () => {
  const anchors: TurnAnchorDatum[] = Array.from({ length: 30 }, (_, i) => ({
    id: `t${i}`,
    time: `${i}点`,
    summary: `第${i}轮`,
  }));

  test('症状回归「窗口滑动后键盘焦点掉落 body」：焦点刻痕被滑出即迁到最接近刻痕', () => {
    installDom();
    const view = render(<TurnAnchorRail anchors={anchors} currentIndex={0} onJump={() => undefined} />);
    const nav = view.container.querySelector('nav');
    if (nav === null) throw new Error('rail not rendered');
    const buttons = nav.querySelectorAll('button');
    // 窗口 t0..t20（i=0），聚焦 t5
    (buttons[5] as HTMLElement).focus();
    React.act(() => {
      view.rerender(<TurnAnchorRail anchors={anchors} currentIndex={29} onJump={() => undefined} />);
    });
    // 窗口平移到 t9..t29：t5 已卸载，焦点应迁到最接近的 t9（新窗口首格）
    const active = document.activeElement;
    expect(active).not.toBe(document.body);
    expect(nav.contains(active)).toBe(true);
    const moved = Array.prototype.indexOf.call(nav.querySelectorAll('button'), active);
    expect(moved).toBe(0);
    view.unmount();
  });

  test('焦点在窗口内（未被滑出）不动焦点；blur 出 nav 后窗口滑动不再迁焦', () => {
    installDom();
    const view = render(<TurnAnchorRail anchors={anchors} currentIndex={10} onJump={() => undefined} />);
    const nav = view.container.querySelector('nav');
    if (nav === null) throw new Error('rail not rendered');
    const buttons = nav.querySelectorAll('button');
    (buttons[15] as HTMLElement).focus();
    // t15 在新窗口 t5..t25 内：焦点不动
    React.act(() => {
      view.rerender(<TurnAnchorRail anchors={anchors} currentIndex={15} onJump={() => undefined} />);
    });
    expect(document.activeElement).toBe(buttons[15]);
    // 焦点离开 nav（blur 登记注销）后窗口滑动：不得把焦点抢回刻痕
    (buttons[15] as HTMLElement).blur();
    React.act(() => {
      view.rerender(<TurnAnchorRail anchors={anchors} currentIndex={29} onJump={() => undefined} />);
    });
    expect(document.activeElement).toBe(document.body);
    view.unmount();
  });
});
