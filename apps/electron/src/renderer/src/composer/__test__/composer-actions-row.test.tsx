import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { ComposerActionsRow } from '../composer-actions-row';

/**
 * 渲染冒烟：模型触发器（T21 起为弹窗入口）与无模型引导分支；
 * 弹窗内交互（搜索/键盘/选择）由 cmdk 内建 + 真机走查覆盖（仓库静态口径）。
 */
function noop(): void {}

function makeProps(overrides: Partial<Parameters<typeof ComposerActionsRow>[0]> = {}): Parameters<typeof ComposerActionsRow>[0] {
  return {
    model: 'glm/glm-4.7',
    effort: 'high',
    modelOptions: ['glm/glm-4.7', 'glm/glm-5.3'],
    effortOptions: ['low', 'high'],
    attachLabel: copy.composer.attach,
    compactLabel: copy.composer.compact,
    sendLabel: copy.composer.send,
    stopLabel: copy.composer.stop,
    contextUsageLabel: copy.composer.contextUsage,
    noModelsLabel: copy.composer.noModels,
    effortUnavailableLabel: copy.composer.effortUnavailable,
    contextUsed: 0,
    canSend: true,
    generating: false,
    compacting: false,
    permissionMode: null,
    permissionFollowsGlobal: false,
    onSelectModel: noop,
    onSelectEffort: noop,
    onSelectPermissionMode: noop,
    onFollowPermissionGlobal: noop,
    onCompact: noop,
    onAttach: noop,
    stats: null,
    onStop: noop,
    ...overrides,
  };
}

describe('输入框底行模型选择（弹窗入口）', () => {
  test('触发器渲染当前模型（文案不变是回归锚点）+ haspopup=dialog；弹窗关态零渲染', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps()} />);
    expect(html).toContain('glm/glm-4.7');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain(copy.modelPicker.searchPlaceholder);
    expect(html).not.toContain(copy.modelPicker.empty);
  });

  test('无模型 + 引导回调：渲染引导按钮（不渲染弹窗触发器）', () => {
    const html = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ modelOptions: [], model: '', onOpenSettings: noop })} />,
    );
    expect(html).toContain(copy.composer.noModels);
    expect(html).not.toContain('aria-haspopup="dialog"');
  });

  test('无模型且无引导回调：退化为空触发器（与旧菜单同形，不崩）', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ modelOptions: [], model: '' })} />);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain(copy.composer.noModels);
  });
});
