import { expect, test } from 'bun:test';

import { copyOfError } from '@/lib/error-text';

/** 建会话失败文案查表（默认语言 zh）：hub 拒绝 → 可行动指引（不透传密文）。 */

test('症状回归「无法开始会话（thinkingLevel rejected: model does not support thinking）」：思考档拒绝给出开关去向', () => {
  const text = copyOfError({ kind: 'capability_thinking', message: 'thinkingLevel rejected: model does not support thinking' });
  expect(text).toContain('思考');
  expect(text).toContain('默认');
  // 不透传原始密文
  expect(text).not.toContain('thinkingLevel rejected');
});

test('其余分派保持：宿主未就绪 / 模型不可用 / 目录类 / 通用查表', () => {
  expect(copyOfError({ kind: 'transient', face: 'host_unavailable' })).toContain('宿主');
  expect(copyOfError({ kind: 'model_unavailable' })).toContain('Provider');
  expect(copyOfError({ kind: 'cwd_not_found' })).toContain('目录');
  expect(copyOfError({ kind: 'unknown_thread', message: 'Unknown threadId' })).toBe('会话已失效，请重新打开该会话。');
});
