import { describe, expect, test } from 'bun:test';

import { copy } from '@/strings';

/** newTask.createFailed 失败文案分派：hub 自然语错误 → 可行动指引（不透传密文）。 */

describe('newTask.createFailed 文案分派', () => {
  test('症状回归「无法开始会话（thinkingLevel rejected: model does not support thinking）」：思考档拒绝给出开关去向', () => {
    const text = copy.newTask.createFailed('thinkingLevel rejected: model does not support thinking');
    expect(text).toContain('思考');
    expect(text).toContain('默认');
    // 不透传原始密文
    expect(text).not.toContain('thinkingLevel rejected');
  });

  test('其余分派保持：宿主未就绪 / 模型不可用 / 目录类 / 通用透传', () => {
    expect(copy.newTask.createFailed('host_unavailable')).toContain('宿主');
    expect(copy.newTask.createFailed('Model not found: x')).toContain('Provider');
    expect(copy.newTask.createFailed('cwd does not exist')).toContain('目录');
    expect(copy.newTask.createFailed('weird failure')).toContain('weird failure');
  });
});
