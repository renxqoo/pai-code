// 压缩摘要帧判别（CONTEXT-TOKEN-UNIFICATION §3.4 P5）：compaction 全触发面 +
// autocompact L2 的 replace 型 user/message 落账。append 型用户消息永不命中。
// 与 snapshot-frame 同构的跨包协议镜像（app 侧不依赖 x-harness——常量复制 +
// 锁测试对齐上游 AUTO_CONTINUATION_NOTE）。

/** autocompact L2 / compaction 自动摘要的落账尾注（上游 compaction/prompts.ts
 *  AUTO_CONTINUATION_NOTE 的镜像——锁测试见 __test__；manual /compact 不附加） */
const AUTO_CONTINUATION_NOTE =
  'The message above is an automatic continuation summary generated mid-task. Continue the current work directly. Do not recap the summary to the user and do not ask for confirmation.';

/** 手动 /compact 摘要的结构特征（compact.ts:283 trigger==="manual" 时不加尾注——
 *  纯协议字段判别会漏掉手动压缩；摘要提示词的固定小节开头做弱判据，与
 *  surfaceOp=replace 合取后误判面收敛到「用户手写同结构文本且以 replace 落账」
 *  ——后者只由内核产生，用户输入恒 append，构造上不可达） */
const MANUAL_SUMMARY_MARKERS = ['## Goal', '## Progress', '# Summary', '## Summary'] as const;

/** 压缩摘要帧谓词：user/message ∧ surfaceOp=replace ∧（尾注在场 ∨ manual 结构特征）。
 *  消费方：entries-mapper 对命中帧附 compaction-summary 标记（渲染层折叠呈现）。 */
export function isCompactionSummary(event: Record<string, unknown>): boolean {
  if (event['type'] !== 'user/message') return false;
  const op = event['surfaceOp'];
  if (typeof op !== 'object' || op === null || (op as Record<string, unknown>)['op'] !== 'replace') return false;
  const content = event['content'];
  if (!Array.isArray(content) || content.length === 0) return false;
  const block = content[0];
  if (typeof block !== 'object' || block === null || (block as Record<string, unknown>)['type'] !== 'text') return false;
  const text = (block as Record<string, unknown>)['text'];
  if (typeof text !== 'string' || text === '') return false;
  if (text.includes(AUTO_CONTINUATION_NOTE)) return true;
  return MANUAL_SUMMARY_MARKERS.some((marker) => text.startsWith(marker));
}
