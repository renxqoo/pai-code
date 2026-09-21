import { describe, expect, test } from 'bun:test';

import { errorLogToken } from '../error-log-token';

describe('errorLogToken', () => {
  test('kind 为干；message 取首行截断拼接', () => {
    expect(errorLogToken({ kind: 'unknown_thread', message: 'Unknown threadId' })).toBe('unknown_thread:Unknown threadId');
    expect(errorLogToken({ kind: 'invalid_params' })).toBe('invalid_params');
    expect(errorLogToken({ kind: 'internal_error', message: `line1\nline2\n${'x'.repeat(200)}` })).toBe('internal_error:line1');
  });

  test('transient 细分 face（kind 恒为 transient 无区分度）；unregistered_code 细分 code', () => {
    expect(errorLogToken({ kind: 'transient', face: 'host_unavailable' })).toBe('transient:host_unavailable');
    expect(errorLogToken({ kind: 'transient', face: 'command_failed', message: 'no dial' })).toBe('transient:command_failed:no dial');
    expect(errorLogToken({ kind: 'unregistered_code', code: 'future_code', message: '' })).toBe('unregistered_code:future_code');
  });
});
