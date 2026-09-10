import { describe, expect, test } from 'bun:test';

import { supportedThinkingLevels, thinkingLevelLabel, thinkingLevelOfLabel } from '../thinking-levels';

/**
 * 档位计算镜像 pi-ai getSupportedThinkingLevels：新建任务页无线程时的本地档位数据源，
 * 语义偏移会造成「新建页可选、建会话后被 hub clamp 成别的档」。
 */
describe('supportedThinkingLevels', () => {
  test('不支持思考（reasoning 缺省/非 true/未传）→ 只有 off', () => {
    expect(supportedThinkingLevels(undefined)).toEqual(['off']);
    expect(supportedThinkingLevels({})).toEqual(['off']);
    expect(supportedThinkingLevels({ reasoning: false })).toEqual(['off']);
  });

  test('支持思考且无 map → 基础五档（xhigh/max 需显式映射，缺省不给）', () => {
    expect(supportedThinkingLevels({ reasoning: true })).toEqual(['off', 'minimal', 'low', 'medium', 'high']);
  });

  test('map 显式 null 的档被剔除', () => {
    expect(supportedThinkingLevels({ reasoning: true, thinkingLevelMap: { minimal: null } })).toEqual([
      'off', 'low', 'medium', 'high',
    ]);
  });

  test('xhigh/max 仅在显式映射时可用；其余档缺省即有', () => {
    expect(supportedThinkingLevels({ reasoning: true, thinkingLevelMap: { xhigh: '70', max: '99' } })).toEqual([
      'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
    ]);
    expect(supportedThinkingLevels({ reasoning: true, thinkingLevelMap: { high: 'high' } })).toEqual([
      'off', 'minimal', 'low', 'medium', 'high',
    ]);
  });
});

describe('档位展示名', () => {
  test('词表内双向可逆；词表外回落原值（手写 models.json 扩展档）', () => {
    expect(thinkingLevelLabel('xhigh')).toBe('X-high');
    expect(thinkingLevelOfLabel('X-high')).toBe('xhigh');
    expect(thinkingLevelLabel('turbo')).toBe('turbo');
    expect(thinkingLevelOfLabel('turbo')).toBe('turbo');
  });
});
