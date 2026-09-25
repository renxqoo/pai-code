import { describe, expect, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';
import { render } from '@/testing/render';

import type { TokenAnalyticsView } from '@paiapp/contracts';

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
};

const USAGE: UsageControls = {
  stats: null,
  analytics: null,
  label: copy.composer.usageSummary,
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
    sending: false,
    generating: false,
    onStop: noop,
    permissionMode: null,
    permissionModes: ['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto'],
    onSelectPermissionMode: noop,
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

  test('症状回归：新建任务页（只有思考档面、无用量面）思考档仍可选，用量入口不摆假控件', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ usage: null })} />);
    // 思考档控件渲染且展示当前值
    expect(html).toContain('high');
    // 用量入口是会话面数据，不渲染
    expect(html).not.toContain(copy.composer.usageSummary);
    // 附件与发送仍在
    expect(html).toContain(copy.composer.attach);
    expect(html).toContain(copy.composer.send);
  });

  test('思考档与用量入口都缺（双 null）时两项皆不渲染', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ effort: null, usage: null })} />);
    expect(html).not.toContain(copy.composer.usageSummary);
    // 思考档触发器带 aria-label=当前值：控件不渲染即无此标记
    expect(html).not.toContain('aria-label="high"');
  });

  test('用量入口：stats 已拉取为可点按钮（title=用量），未拉取退化为纯展示占位', () => {
    const fetched = renderToStaticMarkup(
      <ComposerActionsRow
        {...makeProps({ usage: { stats: { userMessages: 1, assistantMessages: 2, toolCalls: 3, tokens: { input: 1200, output: 340, total: 1540 }, cost: 0 }, analytics: null, label: copy.composer.usageSummary } })}
      />,
    );
    const tag = buttonTag(fetched, copy.composer.usageSummary);
    expect(tag).toContain('aria-expanded="false"');
    expect(fetched).toContain('1.5k');

    const unfetched = renderToStaticMarkup(<ComposerActionsRow {...makeProps()} />);
    expect(buttonTag(unfetched, copy.composer.usageSummary)).toBeNull();
    expect(unfetched).toContain('—');
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
      <ComposerActionsRow {...makeProps({ permissionMode: 'acceptEdits' })} />,
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

describe('发送在途 loading（症状：提交卡很久时发送位无任何反馈）', () => {
  test('在途：发送位呈旋转加载（role=status 发送中）且按钮禁用（aria-busy）；结算后回到箭头', () => {
    const busy = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ sending: true })} />);
    const busyTag = buttonTag(busy, copy.composer.send);
    expect(busyTag).toContain('disabled=""');
    expect(busyTag).toContain('aria-busy="true"');
    expect(busy).toContain('role="status"');
    expect(busy).toContain(`aria-label="${copy.composer.sending}"`);

    const idle = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ sending: false })} />);
    expect(buttonTag(idle, copy.composer.send)).not.toContain('disabled=""');
    expect(idle).not.toContain('role="status"');
  });

  test('生成中+有输入在途：排队提交同样有反馈——发送位仍是 loading，不换停止键', () => {
    const html = renderToStaticMarkup(<ComposerActionsRow {...makeProps({ sending: true, generating: true })} />);
    expect(html).toContain('role="status"');
    expect(buttonTag(html, copy.composer.stop)).toBeNull();
  });
});


const STATS_FIXTURE = { userMessages: 1, assistantMessages: 2, toolCalls: 3, toolResults: 4, tokens: { input: 1200, output: 340, total: 1540 }, cost: 0 };

function analyticsOf(pct: number): TokenAnalyticsView {
  return {
    used: 55_000, window: 200_000, utilizationPct: pct, remaining: 145_000,
    systemPrompt: 2_000, tools: 35_000, messages: 18_000,
    cacheHitRate: 0.8, totalCacheRead: 44_000, totalCacheWrite: 5_000, sessionOutput: 3_000,
  };
}

describe('用量主芯片（T43 上下文占用口径——累计 total 不冒充上下文）', () => {
  test('analytics 在场：主指标渲染上下文占用环 + title 带已用占窗口比；不再显百分比文本/累计 total', () => {
    const html = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(28), label: copy.composer.usageSummary } })} />,
    );
    expect(html).toContain('<circle'); // 环形进度（底环 + 弧段）
    expect(html).not.toContain('28%'); // 百分比文本不再渲染
    expect(html).not.toContain('1.5k'); // 累计口径不出现
    const tag = buttonTag(html, copy.composer.usageSummary);
    expect(tag).not.toBeNull();
    expect(tag).toContain('27.5%'); // title 占窗口比（已用 27.5%）
    expect(tag).not.toContain('200k');
  });

  test('阈值变色矩阵（Claude Code 官方示例阈值）：<70 muted；70-89 琥珀；>=90 红', () => {
    const muted = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(69), label: copy.composer.usageSummary } })} />,
    );
    const mutedTag = buttonTag(muted, copy.composer.usageSummary);
    expect(mutedTag).toContain('text-muted-foreground');
    expect(mutedTag).not.toContain('amber');
    expect(mutedTag).not.toContain('destructive');

    const warn = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(70), label: copy.composer.usageSummary } })} />,
    );
    const warnTag = buttonTag(warn, copy.composer.usageSummary);
    expect(warnTag).toContain('text-amber-600');
    expect(warnTag).not.toContain('text-destructive');

    const warnHigh = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(89), label: copy.composer.usageSummary } })} />,
    );
    expect(buttonTag(warnHigh, copy.composer.usageSummary)).toContain('text-amber-600');

    const danger = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(90), label: copy.composer.usageSummary } })} />,
    );
    expect(buttonTag(danger, copy.composer.usageSummary)).toContain('text-destructive');
  });

  test('降级回落：analytics 缺席（插件禁用/旧 hub）显累计 total（现状行为）', () => {
    const html = renderToStaticMarkup(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: null, label: copy.composer.usageSummary } })} />,
    );
    expect(html).toContain('1.5k');
    expect(html).not.toContain('%</button>');
  });
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function settleMs(ms: number): Promise<void> {
  await React.act(async () => {
    await sleep(ms);
  });
}

/** React 的 enter/leave 由 mouseover/mouseout 合成（relatedTarget 判方向）。 */
function hoverIn(el: Element): void {
  React.act(() => {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  });
}

function hoverOut(el: Element): void {
  React.act(() => {
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  });
}

function showsDetails(container: HTMLElement): boolean {
  return (container.textContent ?? '').includes(copy.usage.contextTitle);
}

function usageTriggerHost(container: HTMLElement): Element {
  const button = container.querySelector(`button[aria-label="${copy.composer.usageSummary}"]`);
  expect(button).not.toBeNull();
  return button?.parentElement as Element;
}

describe('用量明细弹层 hover 触发（延迟开关防闪烁）', () => {
  test('进入出现、移出消失', async () => {
    const view = render(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(28), label: copy.composer.usageSummary } })} />,
    );
    const host = usageTriggerHost(view.container);
    expect(showsDetails(view.container)).toBe(false);
    hoverIn(host);
    await settleMs(300);
    expect(showsDetails(view.container)).toBe(true);
    hoverOut(host);
    await settleMs(500);
    expect(showsDetails(view.container)).toBe(false);
    view.unmount();
  });

  test('症状：扫过触发区闪弹层——进→出同帧不开', async () => {
    const view = render(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(28), label: copy.composer.usageSummary } })} />,
    );
    const host = usageTriggerHost(view.container);
    hoverIn(host);
    hoverOut(host);
    await settleMs(300);
    expect(showsDetails(view.container)).toBe(false);
    view.unmount();
  });

  test('症状：跨触发器与弹层缝隙闪断——开启后 出→进 同帧不关', async () => {
    const view = render(
      <ComposerActionsRow {...makeProps({ usage: { stats: STATS_FIXTURE, analytics: analyticsOf(28), label: copy.composer.usageSummary } })} />,
    );
    const host = usageTriggerHost(view.container);
    hoverIn(host);
    await settleMs(300);
    expect(showsDetails(view.container)).toBe(true);
    hoverOut(host);
    hoverIn(host);
    await settleMs(300);
    expect(showsDetails(view.container)).toBe(true);
    view.unmount();
  });
});
