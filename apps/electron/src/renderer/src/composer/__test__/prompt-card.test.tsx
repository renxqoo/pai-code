import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PromptCard, type PromptCardControls } from '../prompt-card';

/**
 * 白卡壳冒烟（仓库静态口径：交互走真机走查）：提交编排入口、排队堆、附件选择入口、
 * 隐藏文件选择器与底行插槽渲染。附件态是组件内部 state，SSR 只覆盖空态。
 */

function renderCard(overrides: Partial<Parameters<typeof PromptCard>[0]> = {}): string {
  return renderToStaticMarkup(
    <PromptCard
      value="hi"
      onSubmit={() => Promise.resolve(true)}
      scope="t1"
      restore={null}
      input={<textarea defaultValue="" />}
      actions={() => <span>ACTIONS</span>}
      {...overrides}
    />,
  );
}

describe('PromptCard 壳', () => {
  test('渲染输入区与底行插槽、隐藏文件选择器（accept=image/*）', () => {
    const html = renderCard();
    expect(html).toContain('<textarea');
    expect(html).toContain('ACTIONS');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
  });

  test('底行插槽拿到附件选择入口（openFilePicker 是函数）', () => {
    let captured: PromptCardControls | null = null;
    renderToStaticMarkup(
      <PromptCard
        value="hi"
        onSubmit={() => Promise.resolve(true)}
        scope="t1"
        restore={null}
        input={<textarea defaultValue="" />}
        actions={(controls) => {
          captured = controls;
          return <span>slot</span>;
        }}
      />,
    );
    expect(typeof captured?.openFilePicker).toBe('function');
  });

  test('排队卡片堆：传入即渲染，缺省不渲染（线程页专属）', () => {
    expect(renderCard({ queued: <span>QUEUED</span> })).toContain('QUEUED');
    expect(renderCard()).not.toContain('QUEUED');
  });
});
