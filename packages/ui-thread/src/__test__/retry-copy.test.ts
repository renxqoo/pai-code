import { describe, expect, test } from 'bun:test';

import { retryLineOf, retryReasonLabel, type RetryCopy } from '../retry-copy';
import { enRetryCopy } from '../../../../apps/electron/src/renderer/src/strings/en-flow';
import { zhRetryCopy } from '../../../../apps/electron/src/renderer/src/strings/zh-flow';
import { retryCopy as mobileRetryCopy } from '../../../../apps/mobile/src/strings/zh';

/** 跨包引用 strings 是 parity 断言的例外面：三份词表与共享拼装的对齐本身是被测行为。 */
const cases: ReadonlyArray<[string, string]> = [
  ['http-429', '请求过于频繁'],
  ['http-408', '请求超时'],
  ['http-500', '上游服务暂时不可用'],
  ['http-503', '上游服务暂时不可用'],
  ['network', '网络中断'],
  ['repetition', '检测到重复输出，正在换一段重试'],
  ['http-418', '暂时不可用'],
  [String(null), '暂时不可用'],
];

describe('retry-copy（共享拼装）', () => {
  test('hub 错误码 → 原因短语（含 repetition 一等码与未知码兜底）', () => {
    for (const [code, expected] of cases) {
      expect(retryReasonLabel(code === String(null) ? null : code, zhRetryCopy)).toBe(expected);
    }
  });

  test('整句：序号 + 分隔符 + 原因（单点拼装，无空格漂移）', () => {
    expect(retryLineOf(2, 'http-429', zhRetryCopy)).toBe('重试中（第 2 次） · 请求过于频繁');
    expect(retryLineOf(1, 'network', enRetryCopy)).toBe('Retrying (attempt 1) · Network interrupted');
  });

  test('词表键域对齐：zh / en / mobile 三份 RetryCopy 同键集', () => {
    const keys = (copy: RetryCopy): readonly string[] => Object.keys(copy).sort();
    expect(keys(zhRetryCopy)).toEqual(keys(enRetryCopy));
    expect(keys(zhRetryCopy)).toEqual(keys(mobileRetryCopy));
  });

  test('移动端与桌面 zh 词面同源（同一码同一句话）', () => {
    for (const [code] of cases) {
      const normalized = code === String(null) ? null : code;
      expect(retryLineOf(1, normalized, mobileRetryCopy)).toBe(retryLineOf(1, normalized, zhRetryCopy));
    }
  });
});
