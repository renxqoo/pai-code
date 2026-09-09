import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Composer } from '../composer';
import type { CommandView } from '@paiapp/contracts';

const SKILL: CommandView = { name: 'skill:writer', description: null, source: 'skill' };

/** 最小可渲 Composer props（SSR 只走输入区路径）。 */
function baseProps(value: string, commands: readonly CommandView[]) {
  return {
    value,
    placeholder: '输入消息',
    attachLabel: '附图',
    sendLabel: '发送',
    stopLabel: '停止',
    contextUsageLabel: '上下文',
    compactLabel: '压缩',
    contextUsed: 0,
    model: 'm',
    effort: 'e',
    checkout: 'c',
    checkoutLabel: '检出',
    modelOptions: [],
    effortOptions: [],
    checkoutOptions: [],
    permissionMode: null,
    permissionFollowsGlobal: false,
    commands,
    slashAriaLabel: '命令',
    fileAriaLabel: '文件',
    onSearchFiles: () => Promise.resolve(null),
    stats: null,
    threadId: 't1',
    noModelsLabel: '无模型',
    effortUnavailableLabel: '不可用',
    generating: false,
    compacting: false,
    onChange: () => undefined,
    onSubmit: () => Promise.resolve(true),
    onStop: () => undefined,
    onCompact: () => undefined,
    onSelectModel: () => undefined,
    onSelectEffort: () => undefined,
    onSelectCheckout: () => undefined,
    onSelectPermissionMode: () => undefined,
    onFollowPermissionGlobal: () => undefined,
  } as const;
}

describe('Composer 命令 token 高亮接线', () => {
  test('首部命中命令：挂载镜像层高亮 token，textarea 文字转透明只留光标', () => {
    const html = renderToStaticMarkup(<Composer {...baseProps('/skill:writer 写一段', [SKILL])} />);
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('text-dot-active')
    expect(html).toContain('/skill:writer')
    expect(html).toContain('text-transparent')
    expect(html).toContain('caret-foreground')
    // 修复症状：光标被镜像层文字遮挡——镜像层是定位元素恒画在普通流之上，
    // textarea 必须以更高绘制层（relative z-[1]）承载光标
    expect(html).toContain('relative z-[1]')
  })

  test('普通文本：不挂镜像层，textarea 原生渲染（不留透明态）', () => {
    const html = renderToStaticMarkup(<Composer {...baseProps('普通消息', [SKILL])} />);
    expect(html).not.toContain('text-dot-active')
    expect(html).not.toContain('text-transparent')
    expect(html).toContain('text-foreground')
  })

  test('未收录命令不高亮：未知 /xxx 按普通文本渲染', () => {
    const html = renderToStaticMarkup(<Composer {...baseProps('/unknown 命令', [SKILL])} />);
    expect(html).not.toContain('text-transparent')
  })
})
