import { describe, expect, test } from 'bun:test';

import {
  THINKING_LEVEL_LABELS,
  THINKING_LEVEL_ORDER,
  isSettableThinkingLevel,
  thinkingLevelLabel,
  thinkingLevelOfLabel,
} from '../thinking-levels';

/**
 * 档位词表镜像 x-harness host-hub set/get_thinking_level：五档封闭、无 unset 态
 * （get 无值态归一 off）。词表偏移会造成「UI 可选、hub 静默忽略」或反向漏档。
 */
describe('思考档词表', () => {
  test('set 词表 = 五档且顺序稳定（UI 选项顺序）', () => {
    expect([...THINKING_LEVEL_ORDER]).toEqual(['off', 'low', 'medium', 'high', 'max']);
  });

  test('isSettableThinkingLevel：五档 true；扩展档/空串 false（hub 对词表外 set 静默降级——app 先行拒绝）', () => {
    for (const level of THINKING_LEVEL_ORDER) expect(isSettableThinkingLevel(level)).toBe(true);
    for (const bad of ['minimal', 'xhigh', 'turbo', '']) expect(isSettableThinkingLevel(bad)).toBe(false);
  });

  test('label ↔ level 双向映射；未知档回落原值', () => {
    for (const [level, label] of Object.entries(THINKING_LEVEL_LABELS)) {
      expect(thinkingLevelLabel(level)).toBe(label);
      expect(thinkingLevelOfLabel(label)).toBe(level);
    }
    expect(THINKING_LEVEL_LABELS['max']).toBe('Max');
    expect(thinkingLevelLabel('unknown-level')).toBe('unknown-level');
    expect(thinkingLevelOfLabel('unknown-label')).toBe('unknown-label');
  });
});
