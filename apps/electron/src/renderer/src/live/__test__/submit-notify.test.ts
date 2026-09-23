import { describe, expect, test } from 'bun:test';

import { copy } from '@/strings';
import { store } from '@/live/workspace-runtime';

import { notifySubmitFailure } from '../submit-notify';

/** 投递失败通知口径（T43 拆分件）：分派面词表——专项文案/静默面/兜底透传。 */
function noticesInclude(text: string): boolean {
  return store.getState().notices.some((notice) => notice.text === text);
}

describe('notifySubmitFailure（投递失败文案分派）', () => {
  test('null 与 bridge_unavailable 静默（横幅已显式呈现，不叠加通知）', () => {
    notifySubmitFailure(null);
    notifySubmitFailure('bridge_unavailable');
    expect(noticesInclude(copy.flow.sendFailed('bridge_unavailable'))).toBe(false);
  });

  test('专项文案面：恢复失败 / 空舞台 / 图像拒 / 图像超量 / bash 携图互斥', () => {
    notifySubmitFailure('resume_failed');
    expect(noticesInclude(copy.flow.resumeFailed)).toBe(true);
    notifySubmitFailure('no_active_session');
    expect(noticesInclude(copy.flow.noActiveSession)).toBe(true);
    notifySubmitFailure('capability_images');
    expect(noticesInclude(copy.flow.imagesDenied)).toBe(true);
    notifySubmitFailure('images_too_many');
    expect(noticesInclude(copy.flow.imagesTooMany)).toBe(true);
    notifySubmitFailure('bash_images_rejected');
    expect(noticesInclude(copy.flow.bashNoImages)).toBe(true);
  });

  test('transient face 按面出精准文案；未知 kind 兜底原文透传', () => {
    notifySubmitFailure('timeout');
    expect(store.getState().notices.length).toBeGreaterThan(0);
    notifySubmitFailure('some_unknown_kind');
    expect(noticesInclude(copy.flow.sendFailed('some_unknown_kind'))).toBe(true);
  });
});
