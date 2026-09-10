import { describe, expect, test } from 'bun:test';

import { isImmediateSubmit, submitDraftText } from '../submit-draft';
import type { WorkspaceActions } from '@/live/workspace-actions';
import type { ImagePayload } from '@paiapp/contracts';
import { copy } from '@/strings';

/**
 * 提交语义分派：`! ` bash 直执行在渲染层拦截；斜杠命令（含 /compact）不再本地
 * 分派——hub 的 prompt 通路负责拦截与解释（T26 B2），渲染层只保留「不入暂存」
 * 的词法判定。fake actions 只实现 submit-draft 消费的方法（手写替身，不引 mock 库）。
 */
type Recorded = {
  bash: string[]
  submitted: Array<{ text: string; images: readonly ImagePayload[] | undefined }>
  notices: string[]
  cleared: number
}

function makeActions(recorded: Recorded): WorkspaceActions {
  return {
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

function deps(recorded: Recorded) {
  return {
    actions: makeActions(recorded),
    clearDraft: () => {
      recorded.cleared += 1;
    },
  };
}

const IMAGE: ImagePayload = { name: 'a.png', data: 'x', mediaType: 'image/png' } as unknown as ImagePayload;

describe('submitDraftText：`! ` bash 拦截与消息直发', () => {
  test('斜杠命令照常走消息提交（/compact 由 hub prompt 通路拦截，渲染层不分派）', async () => {
    const recorded: Recorded = { bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '/compact')).resolves.toBe(true);
    await expect(submitDraftText(deps(recorded), '/compact 保留迁移重点')).resolves.toBe(true);
    await expect(submitDraftText(deps(recorded), '/skill:writer 写一段')).resolves.toBe(true);
    expect(recorded.bash).toEqual([]);
    expect(recorded.submitted.map((entry) => entry.text)).toEqual(['/compact', '/compact 保留迁移重点', '/skill:writer 写一段']);
    expect(recorded.cleared).toBe(3);
  });

  test('`! ` 直执行走 bash 并清草稿；! /compact 是 bash 命令字面量', async () => {
    const recorded: Recorded = { bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '! /compact')).resolves.toBe(true);
    expect(recorded.bash).toEqual(['/compact']);
    expect(recorded.submitted).toEqual([]);
    expect(recorded.cleared).toBe(1);
  });

  test('`! ` 携图拒绝：false、草稿保留、不执行（空命令经 trim 不成立，无该分支）', async () => {
    const recorded: Recorded = { bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '! ls', [IMAGE])).resolves.toBe(false);
    expect(recorded.bash).toEqual([]);
    expect(recorded.notices).toEqual([copy.flow.bashNoImages]);
    expect(recorded.cleared).toBe(0);
  });

  test('空文本 false 不提交', async () => {
    const recorded: Recorded = { bash: [], submitted: [], notices: [], cleared: 0 };
    await expect(submitDraftText(deps(recorded), '   ')).resolves.toBe(false);
    expect(recorded.submitted).toEqual([]);
  });
});

describe('isImmediateSubmit：生成中不入暂存的即时提交判定', () => {
  test.each([
    ['! bun test', true, 'bash 直执行（容忍前导空白）'],
    ['  ! bun test', true, 'bash 前导空白仍即时'],
    ['/compact', true, '斜杠命令（hub 拦截型）'],
    ['/compact 保留重点', true, '斜杠命令带附加指示'],
    ['/skill:writer 写一段', true, '技能命令'],
    ['/未知命令', true, '任意行首斜杠 token 都是命令族——排队冲刷命令无意义'],
    ['普通消息', false, '普通消息生成中照常暂存'],
    ['看这个 /compact', false, '非行首斜杠是普通消息'],
    [
      ' /compact',
      false,
      '前导空白不即时（与 hub 严格行首词法一致）：生成中进暂存，轮末冲刷时 trim 后仍会被 hub 拦截执行压缩——既有取舍，如实落档',
    ],
    ['', false, '空文本'],
  ])('isImmediateSubmit(%j) = %s（%s）', (text, expected) => {
    expect(isImmediateSubmit(text)).toBe(expected);
  });
});
