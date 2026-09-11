import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ActionButton } from '../action-button';

describe('ActionButton', () => {
  test('solid md（缺省形态）：实心墨色主按钮——设置页保存/新建族的原样形态', () => {
    const html = renderToStaticMarkup(<ActionButton type="button">保存</ActionButton>);
    expect(html).toContain('bg-foreground');
    expect(html).toContain('text-background');
    expect(html).toContain('h-9');
    expect(html).toContain('px-4');
    expect(html).toContain('text-[13px]');
    expect(html).toContain('leading-none');
    expect(html).toContain('font-medium');
    expect(html).toContain('hover:opacity-90');
    expect(html).toContain('disabled:pointer-events-none');
    expect(html).toContain('disabled:opacity-60');
    expect(html).not.toContain('border-border');
  });

  test('solid sm：列表头紧凑形态（图标位 gap + 12.5px）', () => {
    const html = renderToStaticMarkup(<ActionButton size="sm">添加渠道</ActionButton>);
    expect(html).toContain('h-8');
    expect(html).toContain('gap-[6px]');
    expect(html).toContain('px-3');
    expect(html).toContain('text-[12.5px]');
    expect(html).toContain('leading-none');
    expect(html).toContain('bg-foreground');
  });

  test('outline：描边形态自成尺寸（正向锁 h-9/px-3/12.5px/gap，无字重）；md 尺寸冲突由 tailwind-merge 收敛为描边侧', () => {
    const html = renderToStaticMarkup(<ActionButton variant="outline">测试连接</ActionButton>);
    expect(html).toContain('border-border');
    expect(html).toContain('hover:bg-accent');
    expect(html).toContain('disabled:cursor-not-allowed');
    expect(html).toContain('h-9');
    expect(html).toContain('px-3');
    expect(html).toContain('text-[12.5px]');
    expect(html).toContain('gap-[6px]');
    expect(html).toContain('leading-none');
    expect(html).not.toContain('px-4');
    expect(html).not.toContain('text-[13px]');
    expect(html).not.toContain('font-medium');
  });

  test('quiet：安静文字形态（取消钮）——弱化前景色 + 同 outline 的紧凑尺寸', () => {
    const html = renderToStaticMarkup(<ActionButton variant="quiet">取消</ActionButton>);
    expect(html).toContain('text-muted-foreground');
    expect(html).toContain('hover:text-foreground');
    expect(html).toContain('disabled:pointer-events-none');
    expect(html).toContain('h-9');
    expect(html).toContain('px-3');
    expect(html).toContain('text-[12.5px]');
    expect(html).toContain('leading-none');
    expect(html).not.toContain('bg-foreground');
    expect(html).not.toContain('border-border');
    expect(html).not.toContain('font-medium');
  });

  test('disabled 属性与 className 透传（外距等布局修饰不丢）', () => {
    const html = renderToStaticMarkup(
      <ActionButton disabled className="mt-[6px]">
        重跑引导
      </ActionButton>,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('mt-[6px]');
    expect(html).toContain('bg-foreground');
  });

  test('症状钉子：leading-none 在 font-size 之后才不被 cn 的合并吞掉——任一形态丢失 leading-none 即红', () => {
    for (const props of [{}, { size: 'sm' as const }, { variant: 'outline' as const }, { variant: 'quiet' as const }]) {
      const html = renderToStaticMarkup(<ActionButton {...props}>x</ActionButton>);
      expect(html).toContain('leading-none');
    }
  });
});
