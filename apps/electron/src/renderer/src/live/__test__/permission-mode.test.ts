import { expect, test } from 'bun:test';

import { defaultPermissionRules, type PermissionRules } from '@paiapp/contracts';

import { nextSessionRulesForMode } from '../permission-mode';

/** 操作栏会话权限模式切换的基线语义：只改 mode 保 patterns；同模式无操作。 */

const MODES = ['ask', 'allow-all', 'block-all'] as const;

function rulesOf(mode: PermissionRules['mode']): PermissionRules {
  return {
    ...defaultPermissionRules(),
    mode,
    bash: { allowPatterns: ['git status'], blockPatterns: ['sudo *'] },
  };
}

test.each(MODES.flatMap((from) => MODES.filter((to) => to !== from).map((to) => [from, to] as const)))(
  '模式迁移 %s → %s：只改 mode，patterns 保留且引用全新',
  (from, to) => {
    const current = rulesOf(from);
    const next = nextSessionRulesForMode(current, to);
    if (next === null) throw new Error(`expected next rules for ${from} -> ${to}`);
    expect(next.mode).toBe(to);
    expect(next.bash).toEqual({ allowPatterns: ['git status'], blockPatterns: ['sudo *'] });
    // 深拷贝独立性：改写副本数组不得影响原规则
    next.bash.allowPatterns.push('mutated');
    expect(current.bash.allowPatterns).toEqual(['git status']);
  },
);

test.each(MODES)('同模式 %s：返回 null 无操作（不写、不造 sidecar）', (mode) => {
  expect(nextSessionRulesForMode(rulesOf(mode), mode)).toBeNull();
});
