import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';

import { ComposerActionsRow, type EffortControls, type UsageControls } from '../composer-actions-row';

/**
 * 渲染冒烟：模型触发器（T21 起为弹窗入口）与无模型引导分支；思考档与用量环是两个独立
 * 控制组（新任务页只有思考档面）；弹窗内交互（搜索/键盘/选择）由 cmdk 内建 + 真机走查覆盖（仓库静态口径）。
 */
function noop(): void {}

const EFFORT: EffortControls = {
  value: 'high',
  options: ['low', 'high'],
  onSelect: noop,
  unavailableLabel: copy.composer.effortUnavailable,
};

const USAGE: UsageControls = {
  contextUsed: 0,
  stats: null,
  label: copy.composer.contextUsage,
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
    effort: EFFORT,
    usage: USAGE,
    ...overrides,
  };
}

/** 取 aria-label 定位的按钮开标签（disabled 属性与状态类都渲染在开标签上） */
function buttonTag(html: string, label: string): string | null {
  const anchor = `aria-label="${label}"`;
  const end = html.indexOf(anchor);
  if (end === -1) return null;
  const start = html.lastIndexOf('<button', end);
  const close = html.indexOf('>', end);
  return start === -1 || close === -1 ? null : html.slice(start, close + 1);
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

  test('症状回归：新建任务页（只有思考档面、无用量面）思考档仍可选，用量环不摆假控件', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ usage: null })} />);
    // 思考档控件渲染且展示当前值
    expect(html).toContain('high');
    // 用量环是会话面数据，不渲染
    expect(html).not.toContain(copy.composer.contextUsage);
    // 附件与发送仍在
    expect(html).toContain(copy.composer.attach);
    expect(html).toContain(copy.composer.send);
  });

  test('思考档与用量环都缺（双 null）时两项皆不渲染', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ effort: null, usage: null })} />);
    expect(html).not.toContain(copy.composer.contextUsage);
    expect(html).not.toContain(copy.composer.effortUnavailable);
  });

  test('思考档不可用（档位为空）时给禁用原因文案', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ effort: { ...EFFORT, options: [] } })} />);
    expect(html).toContain(copy.composer.effortUnavailable);
  });
});

describe('输入框底行收缩契约（窄卡不把发送键顶出卡片）', () => {
  test('症状回归：超长模型 id 不再撑爆底行——模型名是唯一可收缩项（min-w-0 + truncate，全名在 title/aria-label）', () => {
    const longModel = 'deepseek/deepseek-v4.1-flash-expires-on-0910';
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ model: longModel })} />);
    expect(html).toContain('min-w-0 truncate');
    expect(html).toContain(`title="${longModel}"`);
    expect(html).toContain(`aria-label="${longModel}"`);
  });

  test('固定宽度控件不参与收缩：权限模式 / 思考档触发器带 shrink-0，文案保持 nowrap', () => {
    const html = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ permissionMode: 'allow-all' })} />,
    );
    // 触发器 class 以 shrink-0 结尾（menuTriggerClassName 尾段含 &，静态 markup 里转义为 &amp;，故只断尾段）
    expect(html).toContain(' shrink-0">');
    expect(html).toContain('whitespace-nowrap');
  });
});

describe('输入框底行子代理状态徽标', () => {
  test('不传 agents（新任务页无会话面）不渲染', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps()} />);
    expect(html).not.toContain(copy.flow.agentsWorking(1));
  });

  test('working>0：图标按钮带数量，无障碍名含计数', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ agents: { working: 2, onOpen: noop } })} />);
    expect(html).toContain(copy.flow.agentsWorking(2));
    expect(html).toContain('>2<');
  });

  test('working=0：没有就不展示', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ agents: { working: 0, onOpen: noop } })} />);
    expect(html).not.toContain(copy.flow.agentsWorking(0));
    expect(html).not.toContain('>0<');
  });
});

describe('发送/停止键状态机（禁用灰 / 可发黑 / 生成中空输入红）', () => {
  test('空闲+空输入：发送键禁用（disabled 属性）+ 禁用灰 disabled:bg-send', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ canSend: false })} />);
    const tag = buttonTag(html, copy.composer.send);
    expect(tag).toContain('disabled=""');
    expect(tag).toContain('disabled:bg-send');
    expect(tag).toContain('enabled:bg-primary');
  });

  test('空闲+有输入：发送键启用（无 disabled 属性）+ 可发黑 enabled:bg-primary', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ canSend: true })} />);
    const tag = buttonTag(html, copy.composer.send);
    expect(tag).not.toContain('disabled=""');
    expect(tag).toContain('enabled:bg-primary');
    expect(tag).toContain('type="submit"');
  });

  test('症状回归（生成中+空输入保持红色停止）：停止键 bg-stop 在位，发送键不渲染', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ canSend: false, generating: true })} />);
    const tag = buttonTag(html, copy.composer.stop);
    expect(tag).toContain('bg-stop');
    expect(tag).toContain('type="button"');
    expect(buttonTag(html, copy.composer.send)).toBeNull();
  });

  test('症状回归（生成中+有输入发送键回归黑色）：发送键启用 enabled:bg-primary，停止键不渲染', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ canSend: true, generating: true })} />);
    const tag = buttonTag(html, copy.composer.send);
    expect(tag).not.toContain('disabled=""');
    expect(tag).toContain('enabled:bg-primary');
    expect(buttonTag(html, copy.composer.stop)).toBeNull();
  });
});
