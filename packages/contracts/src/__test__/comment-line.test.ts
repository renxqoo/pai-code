import { describe, expect, test } from 'bun:test';

import { isCommentLine } from '../comment-line';

/**
 * 整行 shell 注释谓词：数据层截断预算与展示层整行剥掉共用同一判定，
 * 词表漂移 = 两侧行为分叉（预算吃了命令、展示又没剥干净），这里锁死。
 */
describe('isCommentLine', () => {
  test.each([
    ['# 注释', true],
    ['  # 行首空白容忍', true],
    ['; 分号注释', true],
    ['\t# 制表符起头', true],
    ['ls # x', false],
    ['grep -n "#" src', false],
    ['a#b', false],
    ['', false],
  ])('%s → %s', (line, expected) => {
    expect(isCommentLine(line)).toBe(expected);
  });
});
