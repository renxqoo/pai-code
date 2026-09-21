import { describe, expect, test } from 'bun:test';

import { errorText } from '../error-text';

describe('errorText', () => {
  test('无 message 只显 kind；有 message 以全角冒号拼接', () => {
    expect(errorText({ kind: 'unknown_thread', message: 'Unknown threadId' })).toBe('unknown_thread：Unknown threadId');
    expect(errorText({ kind: 'branch_exists', message: 'fatal: a branch named x already exists' })).toBe('branch_exists：fatal: a branch named x already exists');
    expect(errorText({ kind: 'invalid_params' })).toBe('invalid_params');
    expect(errorText({ kind: 'invalid_params', message: 'provider_name_conflict' })).toBe('invalid_params：provider_name_conflict');
  });

  test('transient 显示 face（kind 恒为 transient 无区分度）；message 存在时追加', () => {
    expect(errorText({ kind: 'transient', face: 'host_unavailable' })).toBe('host_unavailable');
    expect(errorText({ kind: 'transient', face: 'timeout', message: 'git_failed:timeout' })).toBe('timeout：git_failed:timeout');
  });

  test('unregistered_code 原文透传（code+message 不丢）', () => {
    expect(errorText({ kind: 'unregistered_code', code: 'future_code', message: 'boom' })).toBe('future_code：boom');
    expect(errorText({ kind: 'unregistered_code', code: 'future_code', message: '' })).toBe('future_code');
  });
});
