import { describe, expect, test } from 'bun:test';

import { dialogsOfThread } from '../dialogs-of-thread';
import type { PendingDialog } from '@/live/store';

/**
 * 弹窗跨会话隔离（用户验收）：工具 confirm 模态只属于发起会话——切到其他会话
 * 不得遮挡/呈现。过滤纯函数的引用稳定性同时是渲染层 memo 的事实基础。
 */

function dialog(requestId: string, threadId: string): PendingDialog {
  return { requestId, threadId, method: 'confirm', tool: 'Bash', summary: `summary-${requestId}` };
}

describe('dialogsOfThread 弹窗会话隔离', () => {
  test('全部属于当前会话：返回原数组引用（memo 稳定）', () => {
    const dialogs = [dialog('r1', 'tA'), dialog('r2', 'tA')];
    expect(dialogsOfThread(dialogs, 'tA')).toBe(dialogs);
  });

  test('混合会话：只留当前会话的弹窗，入队序保持', () => {
    const dialogs = [dialog('r1', 'tA'), dialog('r2', 'tB'), dialog('r3', 'tA')];
    const visible = dialogsOfThread(dialogs, 'tA');
    expect(visible.map((entry) => entry.requestId)).toEqual(['r1', 'r3']);
  });

  test('当前会话无弹窗（全属其他会话）：空且引用恒定', () => {
    const dialogs = [dialog('r1', 'tA')];
    const first = dialogsOfThread(dialogs, 'tB');
    const second = dialogsOfThread([dialog('r2', 'tA')], 'tB');
    expect(first).toEqual([]);
    expect(first).toBe(second);
  });

  test('无活跃会话（null）：不呈现任何弹窗', () => {
    const dialogs = [dialog('r1', 'tA')];
    expect(dialogsOfThread(dialogs, null)).toEqual([]);
  });
});
