import { describe, expect, test } from 'bun:test';

import { scaledImageSize } from '../read-image-file';

/** 压缩管线的缩放决策：不放大、长边封顶、等比、最小 1px。 */
describe('scaledImageSize', () => {
  test('长边超限等比缩小到上限；短边按比例', () => {
    expect(scaledImageSize(4000, 2000)).toEqual({ width: 2000, height: 1000 });
    expect(scaledImageSize(1500, 3000)).toEqual({ width: 1000, height: 2000 });
  });

  test('不放大：小于/等于上限原样返回（含正方形边界）', () => {
    expect(scaledImageSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaledImageSize(2000, 2000)).toEqual({ width: 2000, height: 2000 });
    expect(scaledImageSize(1999, 1000)).toEqual({ width: 1999, height: 1000 });
  });

  test('垃圾尺寸降级为 1px，不抛不产出 NaN', () => {
    expect(scaledImageSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(scaledImageSize(0, 5000)).toEqual({ width: 1, height: 2000 });
  });
});
