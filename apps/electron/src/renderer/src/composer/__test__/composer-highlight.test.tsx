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
    cwd: '/w/app',
    branch: { label: 'main', muted: false },
    modelOptions: [],
    effortOptions: [],
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
    queuedMessages: [],
    onSendNowQueued: () => undefined,
    onEditQueued: () => undefined,
    onRemoveQueued: () => undefined,
    restore: null,
    onChange: () => undefined,
    onSubmit: () => Promise.resolve(true),
    onStop: () => undefined,
    onCompact: () => undefined,
    onSelectModel: () => undefined,
    onSelectEffort: () => undefined,
    onSelectPermissionMode: () => undefined,
    onFollowPermissionGlobal: () => undefined,
  } as const;
}

describe('Composer 命令 token 高亮接线', () => {
  test('首部命中命令：挂底色带镜像层，textarea 文字保持原生不透明渲染', () => {
    const html = renderToStaticMarkup(<Composer {...baseProps('/skill:writer 写一段', [SKILL])} />);
    expect(html).toContain('aria-hidden="true"')
    // 底色带方案：命中段为半透明色带（文字层镜像无法像素对齐，见 layer 注释）
    expect(html).toContain('bg-dot-active/15')
    // textarea 文字恒为原生渲染（光标/选区/输入法组合原生正确），永不透明化
    expect(html).toContain('text-foreground')
    expect(html).not.toContain('text-transparent caret-foreground')
    // 镜像层是定位元素恒画在普通流之上，textarea 必须以更高绘制层（relative z-[1]）
    // 保证原生文字与光标画在底色带之上
    expect(html).toContain('relative z-[1]')
  })

  test('普通文本：不挂镜像层，无底色带', () => {
    const html = renderToStaticMarkup(<Composer {...baseProps('普通消息', [SKILL])} />);
    expect(html).not.toContain('bg-dot-active/15')
    expect(html).toContain('text-foreground')
  })

  test('未收录命令不高亮：未知 /xxx 按普通文本渲染', () => {
    const html = renderToStaticMarkup(<Composer {...baseProps('/unknown 命令', [SKILL])} />);
    expect(html).not.toContain('bg-dot-active/15')
  })
})
