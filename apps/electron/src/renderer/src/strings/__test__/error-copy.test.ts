import { describe, expect, test } from 'bun:test';

import { HUB_ERROR_CODES, type ApiError } from '@paiapp/contracts';

import { en } from '../en';
import { zh } from '../zh';

/**
 * errorCopy 查表（W2 收口）：键集完备由 en 表 `satisfies Record<ApiErrorKind, …>`
 * 编译期封闭保证；本文件补运行时对称断言（zh/en 两表 key 集合相等）与
 * unregistered_code 原文透传可见（不折平）。
 */

/** 表项求值（静态句子原样返回；函数项以给定错误求值——与 copyOfError 同一分派语义） */
function evaluate(entry: string | ((error: ApiError) => string), error: ApiError): string {
  return typeof entry === 'function' ? entry(error) : entry;
}

describe('errorCopy', () => {
  test('zh/en 两表 key 集合相等（键集完备由 Record 编译期封闭保证）', () => {
    expect(Object.keys(zh.errorCopy).sort()).toEqual(Object.keys(en.errorCopy).sort());
    // hub 码族 + 两个特型 kind 运行时兜底（AppError 族靠 en 表 satisfies 编译期封闭）
    for (const code of [...HUB_ERROR_CODES, 'unregistered_code', 'transient'] as const) {
      expect(Object.keys(en.errorCopy)).toContain(code);
    }
  });

  test('unregistered_code 原文透传可见（code 与 message 不丢，zh/en 同型）', () => {
    const error: ApiError = { kind: 'unregistered_code', code: 'future_code', message: 'boom' };
    expect(evaluate(zh.errorCopy.unregistered_code, error)).toBe('future_code: boom');
    expect(evaluate(en.errorCopy.unregistered_code, error)).toBe('future_code: boom');
    expect(evaluate(zh.errorCopy.unregistered_code, { kind: 'unregistered_code', code: 'future_code', message: '' })).toBe('future_code');
  });

  test('复用既有文案键：flow/thread 提示与查表同一句子（单一真相，zh/en 两侧）', () => {
    expect(en.errorCopy.capability_images).toBe(en.flow.imagesDenied);
    expect(en.errorCopy.images_too_many).toBe(en.flow.imagesTooMany);
    expect(en.errorCopy.no_active_session).toBe(en.flow.noActiveSession);
    expect(en.errorCopy.resume_failed).toBe(en.flow.resumeFailed);
    expect(en.errorCopy.editor_not_found).toBe(en.thread.openEditorMissing);
    expect(zh.errorCopy.capability_images).toBe(zh.flow.imagesDenied);
    expect(zh.errorCopy.images_too_many).toBe(zh.flow.imagesTooMany);
    expect(zh.errorCopy.no_active_session).toBe(zh.flow.noActiveSession);
    expect(zh.errorCopy.resume_failed).toBe(zh.flow.resumeFailed);
    expect(zh.errorCopy.editor_not_found).toBe(zh.thread.openEditorMissing);
  });
});
