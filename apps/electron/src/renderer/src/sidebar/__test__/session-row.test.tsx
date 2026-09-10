import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SessionCardModel } from '../session-card-model';
import { SessionRow } from '../session-row';

/**
 * 会话行 hover 动作区回归：
 * 锁「同格叠放交叉淡切」形态——时间标签与动作钮占同一网格格，格宽按较大者常驻保留，
 * hover 只切换透明度/可见性，不在流内增删元素，行内布局与标题截断点不因 hover 位移。
 */
function makeSession(overrides: Partial<SessionCardModel> = {}): SessionCardModel {
  return {
    id: 'session-1',
    projectName: 'pai',
    title: '会话标题',
    version: '0.1.0',
    cwd: '/tmp/pai',
    sessionPath: '/tmp/pai/sessions/session-1.jsonl',
    streaming: false,
    lastActivityAt: 1000,
    ...overrides,
  };
}

function noop(): void {}

describe('SessionRow hover 动作区', () => {
  test('hover 抖动症状（hover 时行内布局位移）：时间标签与动作钮同格叠放交叉淡切，不再流内 hidden/flex 切换', () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={makeSession()}
        age="3小时"
        active={false}
        onSelect={noop}
        onClose={noop}
        onRename={noop}
        onTogglePin={noop}
      />,
    );
    expect(html).toContain('col-start-1 row-start-1'); // 两态同格叠放
    expect(html).toContain('group-hover/row:opacity-100'); // 动作钮淡入
    expect(html).toContain('group-hover/row:opacity-0'); // 时间标签淡出（不移除）
    expect(html).not.toContain('group-hover/row:flex'); // 不再流内增删
    expect(html).not.toContain('group-hover/row:hidden'); // 不再流内增删
    expect(html).toContain('invisible'); // 隐藏态动作钮不参与点击与 Tab 焦点
  });

  test('无动作回调的行（只读形态）hover 不隐藏时间标签', () => {
    const html = renderToStaticMarkup(
      <SessionRow session={makeSession()} age="3小时" active={false} onSelect={noop} />,
    );
    expect(html).toContain('3小时');
    expect(html).not.toContain('group-hover/row:opacity-0');
  });

  test('流式会话 loading 症状（指示器出现在文案后面）：活动指示渲染在标题前的行首状态位', () => {
    const html = renderToStaticMarkup(
      <SessionRow session={makeSession({ streaming: true })} age="3小时" active={false} onSelect={noop} />,
    );
    expect(html).toContain('aria-label="进行中"');
    expect(html.indexOf('aria-label="进行中"')).toBeLessThan(html.indexOf('会话标题'));
  });
});
