import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TurnStatusLine } from '../turn-status-line';

function render(props: { label: string; expandable: boolean; open: boolean; changedFiles?: number | null }): string {
  return renderToStaticMarkup(
    <TurnStatusLine
      label={props.label}
      changedFiles={props.changedFiles ?? null}
      expandable={props.expandable}
      open={props.open}
      onToggle={() => undefined}
    />,
  );
}

describe('TurnStatusLine 轮级状态行', () => {
  test('症状回归：收起态也必须显箭头——「已工作 x」是整轮过程唯一的展开入口，箭头若 hover 才显形，用户看不出这行可点', () => {
    const closed = render({ label: '已工作 4m 32s', expandable: true, open: false });
    expect(closed).toContain('已工作 4m 32s');
    expect(closed).toContain('aria-expanded="false"');
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

  test('收起时挂变更摘要（正常完成的轮默认收起，不挂就看不到这轮改了哪些文件）', () => {
    const html = render({ label: '共工作 4m 32s', expandable: true, open: false, changedFiles: 3 });
    expect(html).toContain('共工作 4m 32s');
    expect(html).toContain('改了 3 个文件');
  });

  test('无变更不挂摘要（不凭空多一个后缀）', () => {
    expect(render({ label: '共工作 4m', expandable: true, open: false, changedFiles: null })).not.toContain('改了');
  });

  test('单文件用单数（文案随 count 变），零文件不挂', () => {
    expect(render({ label: '共工作 1m', expandable: true, open: false, changedFiles: 1 })).toContain('改了 1 个文件');
  });
});
