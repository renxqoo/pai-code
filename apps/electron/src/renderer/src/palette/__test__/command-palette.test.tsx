import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { CommandPalette } from '../command-palette';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { render as renderComponent } from '@/testing/render';
import type { SessionView } from '@paiapp/contracts';

/**
 * CommandPalette 冒烟（T34 M3：items 自订阅 store——条目种子改 store 驱动，
 * 断言口径不变）。关态零渲染 / 开态分组词条。
 */

const LABELS = {
  aria: '命令面板',
  placeholder: '搜索操作、会话、文件、命令…',
  empty: '没有匹配项',
  groups: { actions: '操作', sessions: '会话', files: '文件', commands: '命令', settings: '设置' },
};

const SEARCH = (): Promise<string[] | null> => Promise.resolve(['src/a.ts']);

/** 有会话与 cwd 的种子（actionItems 的 hasSession/hasCwd 数据面）。 */
function seedSession(): void {
  const session: SessionView = {
    threadId: 't1',
    cwd: '/tmp/agent-app',
    sessionPath: '/tmp/agent-app/s/t1.jsonl',
    title: '重构会话',
    state: 'live',
    streaming: false,
    model: 'm',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
  liveStore.setState({ sessions: { t1: session }, activeThreadId: 't1', threads: { t1: initialThreadState } });
}

beforeEach(() => {
  liveStore.getState().reset();
});

afterEach(() => {
  liveStore.getState().reset();
});

function renderPalette(open: boolean): string {
  const view = renderComponent(
    <CommandPalette open={open} onClose={() => undefined} searchFiles={SEARCH} labels={LABELS} onSelect={() => undefined} />,
  );
  return view.container.innerHTML ?? '';
}

describe('CommandPalette', () => {
  test('关态零渲染', () => {
    seedSession();
    expect(renderPalette(false)).toBe('');
  });

  test('开态：底部锚定浮层 + 输入框 + 分组词条（客户端渲染——SSR 只见初始 store 快照，装置适配同 T32）', () => {
    seedSession();
    const html = renderPalette(true);
    expect(html).toContain('bottom-');
    expect(html).toContain('aria-label="命令面板"');
    expect(html).toContain('搜索操作、会话、文件、命令…');
    expect(html).toContain('新建任务');
    expect(html).toContain('重构会话');
    expect(html).toContain('agent-app');
  });
});
