import { expect, test } from 'bun:test';

import { clonePermissionRules, defaultPermissionRules, parsePermissionRules, PermissionRulesSchema } from '../permissions';

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

test('宽容解析（parsePermissionRules）：部分文件完整呈现不清档（镜像 hub normalizeRules）', () => {
  const partial = { mode: 'ask', bash: { blockPatterns: ['sudo *'] } };
  expect(parsePermissionRules(partial)).toEqual({
    mode: 'ask',
    bash: { allowPatterns: [], blockPatterns: ['sudo *'] },
    write: { allowPatterns: [], blockPatterns: [] },
    edit: { allowPatterns: [], blockPatterns: [] },
  });
});

test('宽容解析：未知键忽略、非法 mode 回落 ask、非字符串 pattern 丢弃、空数组归一', () => {
  expect(
    parsePermissionRules({ mode: 'yolo', bash: { allowPatterns: ['git status', 7, null], nope: [] }, extra: 1 }),
  ).toEqual({
    mode: 'ask',
    bash: { allowPatterns: ['git status'], blockPatterns: [] },
    write: { allowPatterns: [], blockPatterns: [] },
    edit: { allowPatterns: [], blockPatterns: [] },
  });
});

test('宽容解析：非对象/数组/null 整体降级默认', () => {
  expect(parsePermissionRules('nope')).toEqual(defaultPermissionRules());
  expect(parsePermissionRules([1])).toEqual(defaultPermissionRules());
  expect(parsePermissionRules(null)).toEqual(defaultPermissionRules());
});

test('深拷贝（clonePermissionRules）：全字段相等、组与数组引用全新、改副本不影响原', () => {
  const source = {
    mode: 'ask' as const,
    bash: { allowPatterns: ['git status'], blockPatterns: ['sudo *'] },
    write: { allowPatterns: ['/proj/*'], blockPatterns: ['*/.env'] },
    edit: { allowPatterns: [], blockPatterns: ['*/.env*'] },
  };
  const copy = clonePermissionRules(source);
  expect(copy).toEqual(source);
  expect(copy).not.toBe(source);
  for (const tool of ['bash', 'write', 'edit'] as const) {
    expect(copy[tool]).not.toBe(source[tool]);
    expect(copy[tool].allowPatterns).not.toBe(source[tool].allowPatterns);
    expect(copy[tool].blockPatterns).not.toBe(source[tool].blockPatterns);
    copy[tool].allowPatterns.push('mutated');
    expect(source[tool].allowPatterns).not.toContain('mutated');
  }
});
