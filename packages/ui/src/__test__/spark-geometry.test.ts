import { describe, expect, test } from 'bun:test';

import { SPARK_RAYS, SPARK_RAY_COUNT, sparkRayPath } from '../spark-geometry';

type Point = { x: number; y: number };

function parsePath(path: string): { inner: Point; tip: Point } {
  const match = /^M(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)L(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/.exec(path);
  if (match === null) throw new Error(`unexpected path: ${path}`);
  const [, x1, y1, x2, y2] = match;
  return {
    inner: { x: Number(x1), y: Number(y1) },
    tip: { x: Number(x2), y: Number(y2) },
  };
}

describe('spark geometry', () => {
  test('共 12 条射线，首条从中心指向 12 点方向', () => {
    expect(SPARK_RAYS.length).toBe(SPARK_RAY_COUNT);
    expect(sparkRayPath(0)).toBe('M12.00 9.60L12.00 2.00');
  });

  test('逐 30° 旋转，第二条指向 1 点钟方向', () => {
    expect(sparkRayPath(1)).toBe('M13.20 9.92L15.70 5.59');
  });

  test('所有端点落在 24×24 视区内', () => {
    for (const path of SPARK_RAYS) {
      const { inner, tip } = parsePath(path);
      for (const point of [inner, tip]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(24);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(24);
      }
    }
  });

  test('长短交替：偶数射线端点半径 10、奇数 7.4', () => {
    SPARK_RAYS.forEach((path, index) => {
      const { tip } = parsePath(path);
      const radius = Math.hypot(tip.x - 12, tip.y - 12);
      const expected = index % 2 === 0 ? 10 : 7.4;
      expect(Math.abs(radius - expected)).toBeLessThan(0.01);
    });
  });
});
