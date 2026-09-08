import { expect, test } from 'bun:test';

import { defaultPermissionRules, PermissionRulesSchema } from '../permissions';

/** hub 权限规则 v2 镜像回归：round-trip、拒绝表、降级形态。 */

test('全量字段 round-trip（hub design.md §权限规则文件 样例）', () => {
  const input = {
    mode: 'ask',
    bash: { allowPatterns: ['git status'], blockPatterns: ['sudo *'] },
    write: { allowPatterns: ['/Users/me/proj/*'], blockPatterns: ['*/.env'] },
    edit: { allowPatterns: [], blockPatterns: ['*/.env*'] },
  };
  expect(PermissionRulesSchema.parse(input)).toEqual(input);
});

test.each([
  ['非法 mode', { mode: 'yolo', bash: { allowPatterns: [], blockPatterns: [] }, write: { allowPatterns: [], blockPatterns: [] }, edit: { allowPatterns: [], blockPatterns: [] } }],
  ['未知键', { mode: 'ask', bash: { allowPatterns: [], blockPatterns: [] }, write: { allowPatterns: [], blockPatterns: [] }, edit: { allowPatterns: [], blockPatterns: [] }, extra: 1 }],
  ['缺工具组', { mode: 'ask', bash: { allowPatterns: [], blockPatterns: [] } }],
  ['组内未知键', { mode: 'ask', bash: { allowPatterns: [], blockPatterns: [], nope: [] }, write: { allowPatterns: [], blockPatterns: [] }, edit: { allowPatterns: [], blockPatterns: [] } }],
])('拒绝：%s', (_name, bad) => {
  expect(() => PermissionRulesSchema.parse(bad)).toThrow();
});

test('降级形态 = {mode:"ask"} 空模式（与 hub 热读降级一致）', () => {
  expect(defaultPermissionRules()).toEqual({
    mode: 'ask',
    bash: { allowPatterns: [], blockPatterns: [] },
    write: { allowPatterns: [], blockPatterns: [] },
    edit: { allowPatterns: [], blockPatterns: [] },
  });
});
