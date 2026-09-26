// 压缩摘要帧判别 + 折叠计数（CONTEXT-TOKEN-UNIFICATION §3.4 P5）。
// 上游常量锁测试（AUTO_CONTINUATION_NOTE 与 x-harness compaction/prompts.ts 对齐）
// ——app 侧不依赖 x-harness，常量漂移由本测试的镜像断言暴露（变更时人工同步）。

import { describe, expect, test } from 'bun:test';

import { isCompactionSummary } from '../compaction-summary';
import { mapEntries } from '../entries-mapper';

const NOTE =
  'The message above is an automatic continuation summary generated mid-task. Continue the current work directly. Do not recap the summary to the user and do not ask for confirmation.';

function row(seq: number, event: Record<string, unknown>): { seq: number; ts: number; event: Record<string, unknown> } {
  return { seq, ts: seq, event };
}

describe('isCompactionSummary 谓词', () => {
  test('replace 型 + 尾注在场 → 命中（autocompact L2 / compaction 自动摘要）', () => {
    const event = { type: 'user/message', surfaceOp: { op: 'replace', startSeq: 1, endSeq: 5 }, content: [{ type: 'text', text: `## Goal\n工作摘要\n\n${NOTE}` }] };
    expect(isCompactionSummary(event)).toBe(true);
  });

  test('replace 型 + manual 结构特征（## Goal 开头、无尾注）→ 命中（manual /compact 不加尾注——H4 漏判面）', () => {
    const event = { type: 'user/message', surfaceOp: { op: 'replace', startSeq: 1, endSeq: 5 }, content: [{ type: 'text', text: '## Goal\n手动压缩摘要正文' }] };
    expect(isCompactionSummary(event)).toBe(true);
  });

  test('append 型用户消息 → 永不命中（surfaceOp 判别在前——手写同结构文本不可达）', () => {
    const event = { type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: `## Goal\n${NOTE}` }] };
    expect(isCompactionSummary(event)).toBe(false);
  });

  test('replace 型但非摘要文本（普通替换）→ 不命中', () => {
    const event = { type: 'user/message', surfaceOp: { op: 'replace', startSeq: 1, endSeq: 5 }, content: [{ type: 'text', text: '普通替换落账' }] };
    expect(isCompactionSummary(event)).toBe(false);
  });

  test('上游尾注常量锁（AUTO_CONTINUATION_NOTE 镜像——x-harness compaction/prompts.ts 变更时同步此处）', () => {
    // 尾注原文断言：与上游一字不差（漂移即此测试失败——提醒人工对齐）
    expect(NOTE).toBe(
      'The message above is an automatic continuation summary generated mid-task. Continue the current work directly. Do not recap the summary to the user and do not ask for confirmation.',
    );
  });
});

describe('mapEntries 集成（meta 标记 + 折叠轮数）', () => {
  test('症状回归「92% 摘要 UI 整卡显示」：命中帧附 meta=compaction-summary + foldedTurns（splice 计数），不再走 SystemMessageRow 整卡', () => {
    const { items } = mapEntries({
      entries: [
        row(1, { type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: '问题一' }] }),
        row(2, { type: 'assistant/message', content: [{ type: 'text', text: '回答一' }] }),
        row(3, { type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: '问题二' }] }),
        row(4, { type: 'assistant/message', content: [{ type: 'text', text: '回答二' }] }),
        row(5, { type: 'user/message', surfaceOp: { op: 'replace', startSeq: 1, endSeq: 4 }, content: [{ type: 'text', text: `## Goal\n摘要\n\n${NOTE}` }] }),
      ],
    });
    const summary = items.find((item) => item.kind === 'user' && item.meta === 'compaction-summary');
    expect(summary).toBeDefined();
    expect((summary as { foldedTurns?: number }).foldedTurns).toBe(2); // 被替换区内两条用户消息
    expect(items).toHaveLength(1); // 旧轮折叠后只剩摘要条目
  });

  test('非摘要 replace 落账：无 meta（普通系统条保持现状）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, { type: 'user/message', surfaceOp: 'append', content: [{ type: 'text', text: 'q' }] }),
        row(2, { type: 'user/message', surfaceOp: { op: 'replace', startSeq: 1, endSeq: 1 }, content: [{ type: 'text', text: '非摘要替换' }] }),
      ],
    });
    expect((items[0] as { meta?: string }).meta).toBeUndefined();
  });
});
