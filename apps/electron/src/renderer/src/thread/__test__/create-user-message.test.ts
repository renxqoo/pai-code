import { describe, expect, test } from 'bun:test';

import { createUserMessage } from '../create-user-message';

describe('createUserMessage', () => {
  test('空白草稿（含纯空白字符）返回 blank，不产生消息', () => {
    expect(createUserMessage('')).toEqual({ ok: false, reason: 'blank' });
    expect(createUserMessage('   \n\t ')).toEqual({ ok: false, reason: 'blank' });
  });

  test('去除首尾空白后构造用户消息', () => {
    const result = createUserMessage('  你好 \n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.role).toBe('user');
      expect(result.message.text).toBe('你好');
    }
  });

  test('连续构造的消息 id 互不相同（回归：同毫秒两次提交 React key 相撞）', () => {
    const first = createUserMessage('第一条');
    const second = createUserMessage('第二条');
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.message.id).not.toBe(second.message.id);
    }
  });
});
