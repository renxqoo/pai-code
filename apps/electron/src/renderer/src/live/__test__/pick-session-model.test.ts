import { expect, test } from 'bun:test';

import { pickSessionModel } from '../pick-session-model';

const models = [
  { provider: 'a', modelId: 'm1' },
  { provider: 'b', modelId: 'm2' },
];

test('默认模型命中优先', () => {
  expect(pickSessionModel(models, 'b/m2', 'a/m1')).toEqual({ provider: 'b', modelId: 'm2' });
});

test('默认未设回落当前选择', () => {
  expect(pickSessionModel(models, null, 'b/m2')).toEqual({ provider: 'b', modelId: 'm2' });
});

test('默认失效（不在目录中）回落当前选择（方案边界条目）', () => {
  expect(pickSessionModel(models, 'ghost/m9', 'a/m1')).toEqual({ provider: 'a', modelId: 'm1' });
});

test('默认与当前都失效回落首个可用模型', () => {
  expect(pickSessionModel(models, 'ghost/m9', 'ghost/m8')).toEqual({ provider: 'a', modelId: 'm1' });
});

test('空目录返回 undefined', () => {
  expect(pickSessionModel([], 'a/m1', 'a/m1')).toBeUndefined();
});
