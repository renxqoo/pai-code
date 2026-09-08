import { expect, test } from 'bun:test';

import { renameCommitValue } from '../rename-commit';

test('提交值 trim 后返回', () => {
  expect(renameCommitValue('  新标题  ', '旧标题')).toBe('新标题');
});

test('症状回归（旧会话卡片语义）：trim 后为空 = 取消', () => {
  expect(renameCommitValue('   ', '旧标题')).toBeNull();
  expect(renameCommitValue('', '旧标题')).toBeNull();
});

test('症状回归（旧会话卡片语义）：与原标题相同 = 取消（trim 后比较）', () => {
  expect(renameCommitValue('旧标题', '旧标题')).toBeNull();
  expect(renameCommitValue(' 旧标题 ', '旧标题')).toBeNull();
});

test('原标题为空串时非空提交有效（空标题会话也可命名）', () => {
  expect(renameCommitValue(' 名字 ', '')).toBe('名字');
  expect(renameCommitValue('  ', '')).toBeNull();
});
