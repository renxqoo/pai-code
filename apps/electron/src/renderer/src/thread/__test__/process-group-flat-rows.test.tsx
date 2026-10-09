import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

import { ProcessGroup } from '../process-group';
import { ToolsBlock } from '../tools-block';
import type { ToolCallModel, TurnRun } from '../process-runs';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

/**
 * 真机走查暴露的缺陷（症状）：过程组展开后，并行批次**又套了一层自己的组头**——
 * 外层是计数式「编辑 3 个文件, 运行 4 条命令」，内层是动宾流水「编辑了文件运行了命令」。
 * 两个问题：
 * 1. 双层折叠头，两种标题形态并存；
 * 2. 内层 `ToolGroup` 默认只认失败自动展开，**在途调用的行被挡在里面看不见**——
 *    外层 ProcessGroup 因 running 自动展开了，实际仍看不到在跑的那一条。
 *
 * 本文件钉的是**展开后行真的在 DOM 里**（渲染行为），不是判据函数本身。
 */

function call(name: string, overrides: Partial<ToolCallModel> = {}): ToolCallModel {
  return {
    id: `${name}-1`,
    name,
    argsPreview: `${name} 参数`,
    subagents: [],
    editHunks: [],
    output: '',
    exitCode: 0,
    durationMs: 10,
    status: 'ok',
    ...overrides,
  };
}

const batch: readonly ToolCallModel[] = [
  call('edit', { id: 'e1' }),
  call('edit', { id: 'e2' }),
  call('bash', { id: 'b1', status: 'running' }),
  call('bash', { id: 'b2' }),
];

const runOf = (calls: readonly ToolCallModel[]): TurnRun => ({
  kind: 'process',
  blocks: [{ kind: 'tools', id: 'c1', calls: [...calls] }],
});

describe('过程组内不套第二层组头', () => {
  test('ToolsBlock 在过程组内：并行批次直接铺成执行行，无内层组头', () => {
    const html = renderToStaticMarkup(<ToolsBlock calls={[...batch]} insideProcessGroup />);
    // 四个调用都在（执行行渲染参数摘要，不渲染 call id；title 属性与文本各出现一次）
    expect(html.match(/title="edit 参数"/g)).toHaveLength(2);
    expect(html.match(/title="bash 参数"/g)).toHaveLength(2);
    // 但没有动宾流水那个内层组头，也没有第二个折叠开关
    expect(html).not.toContain('编辑了文件');
    expect(html).not.toContain('aria-expanded="false"');
  });

  test('ToolsBlock 在过程组外（消息级）：仍走 ToolGroup 组头（既有行为不变）', () => {
    const html = renderToStaticMarkup(<ToolsBlock calls={[...batch]} />);
    expect(html).toContain('编辑了文件');
    expect(html).toContain('aria-expanded="false"');
  });

  test('真机症状回归「批次逐条结算引发开合对」：默认收，点开后行真的可见且无内层组头', () => {
    installDom();
    const view = render(<ProcessGroup run={runOf(batch)} streamingThinkingBlockId={null} subagentBusy={false} />);
    const head = view.container.querySelector('button[aria-expanded]');
    if (head === null) throw new Error('组头未渲染');
    // 批次在跑（组内有 running 调用）也**不**自动展开——那正是闪现的成因
    expect(head.getAttribute('aria-expanded')).toBe('false');

    // 用户点开后：行真的进 DOM，且没有第二层动宾流水组头挡着
    React.act(() => {
      head.click();
    });
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(view.container.innerHTML).toContain('正在运行');
    expect(view.container.innerHTML).toContain('bash 参数');
    expect(view.container.innerHTML).not.toContain('编辑了文件');
    view.unmount();
  });

  test('默认收起态：只渲染计数式标题，行不进 DOM', () => {
    const settled: readonly ToolCallModel[] = [
      call('edit', { id: 'e1' }),
      call('edit', { id: 'e2' }),
      call('bash', { id: 'b1' }),
    ];
    const html = renderToStaticMarkup(<ProcessGroup run={runOf(settled)} streamingThinkingBlockId={null} subagentBusy={false} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('编辑 2 个文件');
    expect(html).toContain('运行 1 条命令');
    expect(html).not.toContain('e1 参数');
  });

  test('展开区限高 248px + 滚动（纯像素值：窗口最小高度 560 下 vh 护栏从未生效）', () => {
    installDom();
    const view = render(<ProcessGroup run={runOf(batch)} streamingThinkingBlockId={null} subagentBusy={false} />);
    const head = view.container.querySelector('button[aria-expanded]');
    if (head === null) throw new Error('组头未渲染');
    React.act(() => {
      head.click();
    });
    // jsdom 不解析 Tailwind 类，getComputedStyle 查不到 overflow-y——按 class + 内联样式断言
    const scroller = [...view.container.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto'));
    expect(scroller).toBeDefined();
    expect(scroller?.getAttribute('style')).toContain('max-height: 248px');
    view.unmount();
  });
});

