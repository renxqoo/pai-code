import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TurnStatusLine } from '../turn-status-line';

function render(props: { label: string; expandable: boolean; open: boolean }): string {
  return renderToStaticMarkup(
    <TurnStatusLine label={props.label} expandable={props.expandable} open={props.open} onToggle={() => undefined} />,
  );
}

describe('TurnStatusLine 轮级状态行', () => {
  test('症状回归：收起态也必须显箭头——「已工作 x」是整轮过程唯一的展开入口，\n     箭头若 hover 才显形，用户看不出这行可点（不得回归成 opacity-0）', () => {
    const closed = render({ label: '已工作 4m 32s', expandable: true, open: false });
    expect(closed).toContain('已工作 4m 32s');
    expect(closed).toContain('aria-expanded="false"');
    // 收起态也要有可见箭头
    expect(closed).not.toContain('opacity-0');
    expect(closed).toContain('opacity-70');
  });

  test('展开态箭头照常显形（两态都有提示）', () => {
    const open = render({ label: '已工作 4m 32s', expandable: true, open: true });
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('opacity-70');
    expect(open).not.toContain('opacity-0');
  });

  test('运行中的轮次只显示走表计时，无开关（还没结束，无过程可展开）', () => {
    const running = render({ label: '已工作 12s', expandable: false, open: true });
    expect(running).toContain('已工作 12s');
    expect(running).not.toContain('aria-expanded');
    expect(running).not.toContain('<svg');
  });

  test('行本体不带 hover 显形类（显形规则只属于行内小单元）', () => {
    const closed = render({ label: '已工作 4m', expandable: true, open: false });
    expect(closed).not.toContain('group-hover:opacity-70');
    expect(closed).not.toContain('group-focus-within:opacity-70');
  });
});
