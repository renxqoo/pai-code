import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CommandPanel } from '../command-panel';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { render as renderComponent } from '@/testing/render';
import type { SessionView } from '@x3code/contracts';

/**
 * CommandPanel 装配面冒烟（items 自订阅 store——条目种子改 store 驱动，断言口径不变）。
 *
 * 面板内容经 DialogPortal 落到 body，happy-dom 下不随同步渲染挂载，故此处只断
 * 静态可渲染面（关态零渲染 + 可访问名）；分组词条由 use-command-panel 的 items
 * 用例与 palette-items 构建器用例覆盖，面板实挂形态交真机走查。
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

function markup(open: boolean, defaultItemValue: string | null = null): string {
  return renderToStaticMarkup(
    <CommandPanel
      open={open}
      onOpenChange={() => undefined}
      searchFiles={SEARCH}
      labels={LABELS}
      defaultItemValue={defaultItemValue}
      onSelect={() => undefined}
    />,
  );
}

describe('CommandPanel 装配面', () => {
  test('关态零渲染', () => {
    seedSession();
    expect(markup(false)).toBe('');
  });

  test('开态渲染可访问名：sr-only 标题即 aria 名，description 落搜索占位（生成物默认值是英文硬编码，必须由调用方覆盖）', () => {
    seedSession();
    const html = markup(true);
    expect(html).toContain(LABELS.aria);
    expect(html).toContain(LABELS.placeholder);
    expect(html).not.toContain('Command Palette');
    expect(html).not.toContain('Search for a command to run');
  });

  test('客户端渲染：CommandDialog 壳在树内（面板内容走 Portal，不落在 render 容器）', () => {
    seedSession();
    const view = renderComponent(
      <CommandPanel
        open={true}
        onOpenChange={() => undefined}
        searchFiles={SEARCH}
        labels={LABELS}
        defaultItemValue="session:t1"
        onSelect={() => undefined}
      />,
    );
    expect(document.body.querySelector('[data-slot="dialog-title"]')?.textContent).toBe(LABELS.aria);
    // Portal 内容不在容器内——钉住这条免得后来者在容器 innerHTML 上写断言
    expect(view.container.querySelector('[data-slot="command-item"]')).toBeNull();
    view.unmount();
  });
});