import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageList } from '../message-list';
import type { ThreadModel } from '../thread-model';

const emptyThread: ThreadModel = { sessionId: 's1', items: [], agents: [] };

function renderList(thread: ThreadModel, loading = false): string {
  return renderToStaticMarkup(
    <MessageList
      thread={thread}
      now={0}
      loading={loading}
      bottomInset={184}
      emptyTitle="开始新任务"
      emptyHint="输入消息"
      onOpenDiff={() => undefined}
      onEditUserMessage={() => undefined}
      onForkUserMessage={() => undefined}
      onRetryHydrate={() => undefined}
      retryLabel="重试"

    />,
  );
}

describe('MessageList 渲染', () => {
  test('修复症状：整页滚动滚不到底——内容列盒取自然高（shrink-0 + min-h-full），底部避让 padding 计入可滚动区域', () => {
    const html = renderList(emptyThread);
    expect(html).toContain('min-h-full');
    expect(html).toContain('shrink-0');
    expect(html).toContain('padding-bottom:184px');
  });

  test('空会话展示空态引导，执行中空窗展示执行指示', () => {
    expect(renderList(emptyThread)).toContain('开始新任务');
    expect(renderList(emptyThread, true)).toContain('aria-label="正在执行…"');
  });
});
