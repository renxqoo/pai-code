import { describe, expect, test } from 'bun:test';

import { isImmediateSubmit, submitDraftText } from '../submit-draft';
import type { WorkspaceActions } from '@/live/workspace-actions';
import type { ImagePayload } from '@paiapp/contracts';
import { copy } from '@/strings';

/**
 * 提交语义分派表驱动：`! ` bash 直执行 / `/compact` 内置命令拦截 / 普通消息。
 * fake actions 只实现 submit-draft 消费的方法（手写替身，不引 mock 库）。
 */
type Recorded = {
  compact: Array<{ customInstructions: string | undefined }>
  bash: string[]
  submitted: Array<{ text: string; images: readonly ImagePayload[] | undefined }>
  notices: string[]
  cleared: number
}

function makeActions(recorded: Recorded, compactAccepted: () => boolean = () => true): WorkspaceActions {
  return {
    compact: (customInstructions) => {
      recorded.compact.push({ customInstructions });
      return Promise.resolve(compactAccepted());
    },
    runBash: (command) => {
      recorded.bash.push(command);
      return Promise.resolve(null);
    },
    submitDraft: (text, images) => {
      recorded.submitted.push({ text, images });
      return Promise.resolve(null);
    },
    showNotice: (text) => {
      recorded.notices.push(text);
    },
  } as unknown as WorkspaceActions;
}

function deps(recorded: Recorded, compactAccepted?: () => boolean) {
  return {
    actions: makeActions(recorded, compactAccepted),
    clearDraft: () => {
      recorded.cleared += 1;
    },
  };
}

const IMAGE: ImagePayload = { name: 'a.png', data: 'x', mediaType: 'image/png' } as unknown as ImagePayload;

describe('submitDraftText：/compact 内置命令拦截', () => {
  test('裸 /compact：调 actions.compact(undefined)，受理后清草稿', async () => {
    const recorded: Recorded = { compact: [], bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '/compact')).resolves.toBe(true);
    expect(recorded.compact).toEqual([{ customInstructions: undefined }]);
    expect(recorded.submitted).toEqual([]);
    expect(recorded.cleared).toBe(1);
  });

  test('/compact 后随文字 → customInstructions；后随空白首尾收敛、内部原样', async () => {
    const recorded: Recorded = { compact: [], bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '/compact  保留迁移重点  ')).resolves.toBe(true);
    expect(recorded.compact).toEqual([{ customInstructions: '保留迁移重点' }]);
  });

  test('首 token 不精确匹配（/compactfoo、/compact-x、文中段、前导空白）不拦截，照常作为消息提交', async () => {
    const recorded: Recorded = { compact: [], bash: [], submitted: [], notices: [], cleared: 0 };
    for (const text of ['/compactfoo', '/compact-x', '看这个 /compact', '  /compact']) {
      await expect(submitDraftText(deps(recorded), text)).resolves.toBe(true);
    }
    expect(recorded.compact).toEqual([]);
    expect(recorded.submitted.map((entry) => entry.text)).toEqual(['/compactfoo', '/compact-x', '看这个 /compact', '/compact']);
    expect(recorded.cleared).toBe(4);
  });

  test('携图拒绝：提示 compactNoImages、不清草稿、不调 compact', async () => {
    const recorded: Recorded = { compact: [], bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '/compact', [IMAGE])).resolves.toBe(false);
    expect(recorded.notices).toEqual([copy.flow.compactNoImages]);
    expect(recorded.compact).toEqual([]);
    expect(recorded.cleared).toBe(0);
  });

  test('压缩中重复触发（actions 拒绝）：false 且草稿保留（症状回归：按钮 disabled 防线迁到命令通路）', async () => {
    const recorded: Recorded = { compact: [], bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded, () => false), '/compact')).resolves.toBe(false);
    expect(recorded.compact).toHaveLength(1);
    expect(recorded.cleared).toBe(0);
  });

  test('`! ` 前缀优先于命令词法：! /compact 走 bash 直执行', async () => {
    const recorded: Recorded = { compact: [], bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '! /compact')).resolves.toBe(true);
    expect(recorded.bash).toEqual(['/compact']);
    expect(recorded.compact).toEqual([]);
  });
});

describe('isImmediateSubmit：生成中不入暂存的即时提交判定', () => {
  test.each([
    ['! bun test', true, 'bash 直执行（容忍前导空白）'],
    ['  ! bun test', true, 'bash 前导空白仍即时'],
    ['/compact', true, '内置命令'],
    ['/compact 保留重点', true, '内置命令带附加指示'],
    ['/compactfoo', false, '非命令文本是普通消息，生成中照常暂存'],
    ['  /compact', false, '命令词法严格行首，前导空白不即时（与高亮一致）'],
    ['普通消息', false, '普通消息'],
    ['', false, '空文本'],
  ])('isImmediateSubmit(%j) = %s（%s）', (text, expected) => {
    expect(isImmediateSubmit(text)).toBe(expected);
  });
});
