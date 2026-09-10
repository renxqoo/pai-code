import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SessionCardModel } from '../session-card-model';
import { SessionRow } from '../session-row';

/**
 * 会话行 hover 动作区回归：
 * 锁「同格叠放交叉淡切」形态——时间标签与动作钮占同一网格格，格宽按较大者常驻保留，
 * hover 只切换透明度/可见性，不在流内增删元素，行内布局与标题截断点不因 hover 位移。
 * 行内动作自 T32 起直调 navigation/workspaceActions 单例（可选回调契约移除——
 * 生产路径从不渲染只读行），门控断言保留数据驱动项（sessionPath/live/streaming）。
 */
function makeSession(overrides: Partial<SessionCardModel> = {}): SessionCardModel {
  return {
    id: 'session-1',
    projectName: 'pai',
    title: '会话标题',
    version: '0.1.0',
    cwd: '/tmp/pai',
    sessionPath: '/tmp/pai/sessions/session-1.jsonl',
    state: 'live',
    streaming: false,
    lastActivityAt: 1000,
    ...overrides,
  };
}

describe('SessionRow hover 动作区', () => {
  test('hover 抖动症状（hover 时行内布局位移）：时间标签与动作钮同格叠放交叉淡切，不再流内 hidden/flex 切换', () => {
    const html = renderToStaticMarkup(<SessionRow session={makeSession()} age="3小时" active={false} />);
    expect(html).toContain('col-start-1 row-start-1'); // 两态同格叠放
    expect(html).toContain('group-hover/row:opacity-100'); // 动作钮淡入
    expect(html).toContain('group-hover/row:opacity-0'); // 时间标签淡出（不移除）
    expect(html).not.toContain('group-hover/row:flex'); // 不再流内增删
    expect(html).not.toContain('group-hover/row:hidden'); // 不再流内增删
    expect(html).toContain('invisible'); // 隐藏态动作钮不参与点击与 Tab 焦点
  });

  test('点击关闭按钮无反应：淡出的时间标签（opacity<1 层叠抬升）须退出命中测试，不得盖住动作钮', () => {
    const html = renderToStaticMarkup(<SessionRow session={makeSession()} age="3小时" active={false} />);
    // 时间标签 span（含相对时间文案的那个）必须带 pointer-events-none
    const ageSpan = /<span class="([^"]*)"[^>]*>3小时<\/span>/.exec(html);
    expect(ageSpan).not.toBeNull();
    expect(ageSpan?.[1]).toContain('pointer-events-none');
  });

  test('流式会话 loading 症状（指示器出现在文案后面）：活动指示渲染在标题前的行首状态位', () => {
    const html = renderToStaticMarkup(<SessionRow session={makeSession({ streaming: true })} age="3小时" active={false} />);
    expect(html).toContain('aria-label="进行中"');
    expect(html.indexOf('aria-label="进行中"')).toBeLessThan(html.indexOf('会话标题'));
  });

  test('回收入口（T29）：live 且非流式的行给「回收 Worker」，流式/parked 的行不给（数据驱动门控）', () => {
    const live = renderToStaticMarkup(<SessionRow session={makeSession()} age="3小时" active={false} />);
    expect(live).toContain('aria-label="回收 Worker"');
    const streaming = renderToStaticMarkup(<SessionRow session={makeSession({ streaming: true })} age="3小时" active={false} />);
    expect(streaming).not.toContain('aria-label="回收 Worker"');
    const parked = renderToStaticMarkup(<SessionRow session={makeSession({ state: 'parked' })} age="3小时" active={false} />);
    expect(parked).not.toContain('aria-label="回收 Worker"');
  });

  test('置顶门控：sessionPath 为 null（未落盘）的行不给钉子按钮，其余动作在位', () => {
    const unwired = renderToStaticMarkup(
      <SessionRow session={makeSession({ sessionPath: null })} age="3小时" active={false} />,
    );
    expect(unwired).not.toContain('aria-label="置顶"');
    expect(unwired).toContain('aria-label="关闭会话"');
    expect(unwired).toContain('aria-label="重命名会话"');
    const pinnedPath = renderToStaticMarkup(<SessionRow session={makeSession()} age="3小时" active={false} pinned />);
    expect(pinnedPath).toContain('aria-label="取消置顶"');
  });
});
