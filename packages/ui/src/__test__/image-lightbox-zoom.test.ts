import { describe, expect, test } from 'bun:test';

import {
  clampPan,
  clampRatio,
  hasPanRoom,
  INITIAL_RATIO,
  INITIAL_ZOOM,
  MAX_RATIO,
  MIN_RATIO,
  settleZoom,
  stepRatio,
  zoomAt,
  ZOOM_STEP_FACTOR,
} from '../image-lightbox-zoom';

/** ratio 语义 = 渲染尺寸 / 原图像素：初始 0.6（60%），范围 0.1–8。 */
const ANCHOR = { x: 120, y: -40 };
const NATURAL = { width: 2000, height: 1000 };
const VIEWPORT = { width: 1200, height: 800 };

describe('比例词表', () => {
  test('初始 60%，下限 10%，上限 800%', () => {
    expect(INITIAL_RATIO).toBe(0.6);
    expect(MIN_RATIO).toBe(0.1);
    expect(MAX_RATIO).toBe(8);
    expect(INITIAL_ZOOM).toEqual({ ratio: 0.6, tx: 0, ty: 0 });
  });
});

describe('clampRatio', () => {
  test('范围内不动', () => {
    expect(clampRatio(1)).toBe(1);
    expect(clampRatio(0.6)).toBe(0.6);
  });

  test('越界钳到边界', () => {
    expect(clampRatio(0.01)).toBe(MIN_RATIO);
    expect(clampRatio(99)).toBe(MAX_RATIO);
  });
});

describe('zoomAt', () => {
  test('中心锚点：纯缩放不平移', () => {
    expect(zoomAt(INITIAL_ZOOM, 2)).toEqual({ ratio: 2, tx: 0, ty: 0 });
  });

  test('锚点缩放：锚点下的图像点坐标不变（锚点式变换的立定义）', () => {
    const before = INITIAL_ZOOM;
    const after = zoomAt(before, 1.8, ANCHOR);
    const imageCoord = (z: { ratio: number; tx: number; ty: number }): { x: number; y: number } => ({
      x: (ANCHOR.x - z.tx) / z.ratio,
      y: (ANCHOR.y - z.ty) / z.ratio,
    });
    expect(imageCoord(after).x).toBeCloseTo(imageCoord(before).x);
    expect(imageCoord(after).y).toBeCloseTo(imageCoord(before).y);
  });

  test('缩到下限时归零平移（图像远小于视口，无平移意义）', () => {
    expect(zoomAt({ ratio: 3, tx: 500, ty: 300 }, MIN_RATIO)).toEqual({ ratio: MIN_RATIO, tx: 0, ty: 0 });
  });

  test('超上限的锚点缩放仍钳在 MAX_RATIO', () => {
    const after = zoomAt({ ratio: 6, tx: 100, ty: 100 }, 99, ANCHOR);
    expect(after.ratio).toBe(MAX_RATIO);
  });
});

describe('步进系数', () => {
  test('步进单调递增且在钳制处到顶（连乘 24 次覆盖全量程 0.1→8）', () => {
    let ratio = MIN_RATIO;
    for (let i = 0; i < 24; i += 1) {
      const next = clampRatio(ratio * ZOOM_STEP_FACTOR);
      expect(next).toBeGreaterThanOrEqual(ratio);
      ratio = next;
    }
    expect(ratio).toBe(MAX_RATIO);
  });

  test('每档幅度一致（等比）', () => {
    expect(clampRatio(0.5 * ZOOM_STEP_FACTOR)).toBeCloseTo(0.625);
    expect(clampRatio(1 * ZOOM_STEP_FACTOR)).toBeCloseTo(1.25);
  });
});

describe('stepRatio 吸附 1:1（百分比能停在 100%）', () => {
  test('症状回归：逐档放大必落在 100%（纯等比会跳过 1 而停在 94% 或 117%）', () => {
    // 0.6 → 0.75（未入带，继续）→ 0.9375（落 [0.8,1) 带尾）→ 1（吸附命中）
    const path: number[] = [INITIAL_RATIO];
    let ratio = INITIAL_RATIO;
    for (let i = 0; i < 5; i += 1) {
      ratio = stepRatio(ratio, 1);
      path.push(ratio);
    }
    expect(path).toContain(1);
  });

  test('从 100% 再放大进下一档（不卡死在该档）', () => {
    expect(stepRatio(1, 1)).toBeCloseTo(1.25);
  });

  test('从 100% 向下落到 80%（恰在带边界，不吸附）', () => {
    expect(stepRatio(1, -1)).toBeCloseTo(0.8);
  });

  test('从 125% 向下直接回 100%（落 (0.8,1] 带内）', () => {
    expect(stepRatio(1.25, -1)).toBe(1);
  });

  test('远离 1:1 的档位不受吸附影响（纯等比）', () => {
    expect(stepRatio(0.2, -1)).toBeCloseTo(0.16);
    expect(stepRatio(2, 1)).toBeCloseTo(2.5);
  });

  test('全程严格递增无跳空：从 60% 连续放大 6 档单调上升且必经 1', () => {
    let ratio = INITIAL_RATIO;
    for (let i = 0; i < 6; i += 1) {
      const next = stepRatio(ratio, 1);
      expect(next).toBeGreaterThan(ratio);
      ratio = next;
    }
  });

  test('连续缩小时同样必经 1:1（从 200% 缩到初始档）', () => {
    let ratio = 2;
    const path: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      ratio = stepRatio(ratio, -1);
      path.push(ratio);
    }
    expect(path).toContain(1);
  });
});

describe('clampPan', () => {
  test('图像小于视口时锁中心（初始 60% 的 2000×1000 图：1200×600 < 视口）', () => {
    expect(clampPan({ ratio: INITIAL_RATIO, tx: 80, ty: -50 }, NATURAL, VIEWPORT)).toEqual({
      ratio: INITIAL_RATIO,
      tx: 0,
      ty: 0,
    });
  });

  test('放大后允许拖到图像边缘贴视口边缘', () => {
    // ratio 2 → 4000×2000，宽轴限位 (4000-1200)/2=1400，高轴 (2000-800)/2=600
    const clamped = clampPan({ ratio: 2, tx: 9999, ty: -9999 }, NATURAL, VIEWPORT);
    expect(clamped.tx).toBe(1400);
    expect(clamped.ty).toBe(-600);
  });

  test('非方图各轴独立钳制（放不下即锁该轴）', () => {
    const tall = { width: 100, height: 4000 };
    const clamped = clampPan({ ratio: 1, tx: 400, ty: -5000 }, tall, VIEWPORT);
    expect(clamped.tx).toBe(0);
    expect(clamped.ty).toBe(-((4000 - 800) / 2));
  });
});

describe('settleZoom', () => {
  test('越界平移归位到钳制范围', () => {
    const settled = settleZoom({ ratio: 4, tx: 99999, ty: -99999 }, NATURAL, VIEWPORT);
    expect(settled.tx).toBe((2000 * 4 - 1200) / 2);
    expect(settled.ty).toBe(-((1000 * 4 - 800) / 2));
  });
});

describe('hasPanRoom', () => {
  test('初始 60% 的大图放得下 → 不可拖', () => {
    expect(hasPanRoom({ ratio: INITIAL_RATIO, tx: 0, ty: 0 }, NATURAL, VIEWPORT)).toBe(false);
  });

  test('放大到溢出 → 可拖', () => {
    expect(hasPanRoom({ ratio: 1, tx: 0, ty: 0 }, NATURAL, VIEWPORT)).toBe(true);
  });

  test('刚好铺满 → 不可拖（无余量即钳到 0）', () => {
    const exact = { width: VIEWPORT.width, height: VIEWPORT.height };
    expect(hasPanRoom({ ratio: 1, tx: 0, ty: 0 }, exact, VIEWPORT)).toBe(false);
  });
});