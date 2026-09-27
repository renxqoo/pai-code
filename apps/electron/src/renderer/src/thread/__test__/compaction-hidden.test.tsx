import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { hydrateItems } from '@/live/hydrate-items';
import { MessageList } from '../message-list';
import type { ThreadModel } from '../thread-model';
import type { HistoryItem } from '@paiapp/contracts';

function userItem(id: string, text: string, origin: 'user' | 'system' = 'user', at = 1): HistoryItem {
  return { kind: 'user', id, text, origin, at, images: [] } as HistoryItem;
}

function compactionItem(id: string, text: string, at: number): HistoryItem {
  return { kind: 'user', id, text, origin: 'system', at, images: [], meta: 'compaction-summary' } as HistoryItem;
}

function renderList(items: ReturnType<typeof hydrateItems>): string {
  const thread: ThreadModel = { sessionId: 's1', items, agents: [] };
  return renderToStaticMarkup(
    <MessageList
      thread={thread}
      now={0}
      loading={false}
      bottomInset={184}
      emptyTitle="开始新任务"
      emptyHint="输入消息"
      onOpenDiff={() => undefined}
      onEditUserMessage={() => undefined}
      onForkUserMessage={() => undefined}
    />,
  );
}

describe('压缩摘要不进对话流（用户裁决：前端不展示压缩信息）', () => {
  test('症状回归：压缩摘要不得渲染成任何可见行（此前是「已压缩历史对话」可展开行）', () => {
    const html = renderList(hydrateItems([userItem('u1', '第一条'), compactionItem('c1', '## Goal\n压缩摘要正文', 2), userItem('u2', '第二条')]));
    expect(html).not.toContain('已压缩');
    expect(html).not.toContain('压缩摘要正文');
  });

  test('压缩摘要不得掉进 system 消息分支被渲染成「系统通知」卡片', () => {
    // 删掉专用渲染分支后，system 角色的条目会落到 SystemMessageRow——
    // 那会把摘要正文亮成系统通知卡片，比压缩标记本身更吵
    const html = renderList(hydrateItems([userItem('u1', '第一条'), compactionItem('c1', '摘要正文', 2)]));
    expect(html).not.toContain('系统通知');
  });

  test('水化直接丢弃压缩条目（不占位、不留空行）', () => {
    const items = hydrateItems([userItem('u1', '第一条'), compactionItem('c1', '摘要', 2), userItem('u2', '第二条')]);
    const messages = items.flatMap((item) => (item.kind === 'message' ? [item.message] : []));
    expect(messages.map((message) => message.text)).toEqual(['第一条', '第二条']);
  });

  test('用户真实发言照常渲染（只丢压缩摘要，不是丢 system 消息）', () => {
    const html = renderList(hydrateItems([userItem('u1', '第一条'), userItem('n1', '任务完成通知', 'system', 2)]));
    expect(html).toContain('第一条');
    expect(html).toContain('任务完成通知');
  });

  test('连续两次压缩也零残留（用户实拍：同时出现两条「已压缩历史对话」）', () => {
    const items = hydrateItems([
      userItem('u1', '第一条'),
      compactionItem('c1', '摘要一', 2),
      compactionItem('c2', '摘要二', 3),
      userItem('u2', '第二条'),
    ]);
    const html = renderList(items);
    expect(html).not.toContain('已压缩');
    expect(html).not.toContain('摘要一');
    expect(html).not.toContain('摘要二');
  });
});
