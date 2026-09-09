import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { ComposerActionsRow, type SessionControls } from '../composer-actions-row';

/**
 * 渲染冒烟：模型触发器（T21 起为弹窗入口）与无模型引导分支；会话面控件（思考档/压缩/用量环）
 * 按 session 组有无渲染；弹窗内交互（搜索/键盘/选择）由 cmdk 内建 + 真机走查覆盖（仓库静态口径）。
 */
function noop(): void {}

const SESSION: SessionControls = {
  effort: 'high',
  effortOptions: ['low', 'high'],
  onSelectEffort: noop,
  contextUsed: 0,
  stats: null,
  contextUsageLabel: copy.composer.contextUsage,
  compacting: false,
  compactLabel: copy.composer.compact,
  effortUnavailableLabel: copy.composer.effortUnavailable,
  onCompact: noop,
};

function makeProps(overrides: Partial<Parameters<typeof ComposerActionsRow>[0]> = {}): Parameters<typeof ComposerActionsRow>[0] {
  return {
    model: 'glm/glm-4.7',
    modelOptions: ['glm/glm-4.7', 'glm/glm-5.3'],
    onSelectModel: noop,
    noModelsLabel: copy.composer.noModels,
    attachLabel: copy.composer.attach,
    onAttach: noop,
    sendLabel: copy.composer.send,
    stopLabel: copy.composer.stop,
    canSend: true,
    generating: false,
    onStop: noop,
    permissionMode: null,
    permissionFollowsGlobal: false,
    onSelectPermissionMode: noop,
    onFollowPermissionGlobal: noop,
    session: SESSION,
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

  test('会话面控件按 session 组渲染：有会话出思考档/压缩/用量环，无会话三项皆无（新任务页不摆假控件）', () => {
    const withSession = renderToStaticMarkup(<ComposerActionsRow {...makeProps()} />);
    expect(withSession).toContain(copy.composer.compact);
    expect(withSession).toContain(copy.composer.contextUsage);
    expect(withSession).toContain('high');

    const withoutSession = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ session: null })} />);
    expect(withoutSession).not.toContain(copy.composer.compact);
    expect(withoutSession).not.toContain(copy.composer.contextUsage);
    expect(withoutSession).not.toContain(copy.composer.effortUnavailable);
    // 附件与发送仍在（新任务页可附图提交）
    expect(withoutSession).toContain(copy.composer.attach);
    expect(withoutSession).toContain(copy.composer.send);
  });

  test('思考档不可用（档位为空）时给禁用原因文案', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ session: { ...SESSION, effortOptions: [] } })} />);
    expect(html).toContain(copy.composer.effortUnavailable);
  });
});
