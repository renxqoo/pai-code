import { describe, expect, test } from 'bun:test';

import type { GitGraphCommit } from '@paiapp/contracts';

import { buildGraphLayouts, laneCountOf } from '../graph-layout';

/**
 * 泳道布局表驱动（T36 测试口径）：git log 顺序（新 → 旧、topo 保证子先于父）→
 * 泳道指派与连边。覆盖：线性直落 / 分叉甩出 / merge 汇入 / 多头起始 / 八爪 merge /
 * 泳道复用。
 */

let seq = 0;
function commit(hash: string, parents: string[]): GitGraphCommit {
  seq += 1;
  return {
    hash,
    shortHash: hash.slice(0, 7),
    subject: `subject ${hash}`,
    author: 'pai',
    timestamp: 1_000_000 + seq,
    parents,
    refs: [],
    isHead: false,
  };
}

describe('buildGraphLayouts', () => {
  test('线性历史：全部落 0 号泳道，逐行竖线连边，根提交无边', () => {
    const layouts = buildGraphLayouts([commit('a', ['b']), commit('b', ['c']), commit('c', [])]);
    expect(layouts).toEqual([
      { lane: 0, edges: [{ fromLane: 0, toLane: 0 }] },
      { lane: 0, edges: [{ fromLane: 0, toLane: 0 }] },
      { lane: 0, edges: [] },
    ]);
  });

  test('分叉：支线开新泳道，主线在支线行画贯穿竖线，支线根处斜切回主线', () => {
    // topo 序：M2 → F2 → F1 → M1（F1 的父是 M1，斜连回 0 号泳道）
    const layouts = buildGraphLayouts([
      commit('m2', ['m1']),
      commit('f2', ['f1']),
      commit('f1', ['m1']),
      commit('m1', []),
    ]);
    expect(layouts[0]).toEqual({ lane: 0, edges: [{ fromLane: 0, toLane: 0 }] });
    expect(layouts[1]).toEqual({ lane: 1, edges: [{ fromLane: 0, toLane: 0 }, { fromLane: 1, toLane: 1 }] });
    expect(layouts[2]).toEqual({ lane: 1, edges: [{ fromLane: 0, toLane: 0 }, { fromLane: 1, toLane: 0 }] });
    expect(layouts[3]).toEqual({ lane: 0, edges: [] });
  });

  test('merge：第一父直落本泳道，第二父甩到新泳道，支线行画贯穿竖线', () => {
    // topo 序：MERGE → M2 → F2 → F1 → M1
    const layouts = buildGraphLayouts([
      commit('merge', ['m2', 'f2']),
      commit('m2', ['m1']),
      commit('f2', ['f1']),
      commit('f1', ['m1']),
      commit('m1', []),
    ]);
    expect(layouts[0]).toEqual({ lane: 0, edges: [{ fromLane: 0, toLane: 0 }, { fromLane: 0, toLane: 1 }] });
    expect(layouts[1]).toEqual({ lane: 0, edges: [{ fromLane: 1, toLane: 1 }, { fromLane: 0, toLane: 0 }] });
    expect(layouts[2]).toEqual({ lane: 1, edges: [{ fromLane: 0, toLane: 0 }, { fromLane: 1, toLane: 1 }] });
    expect(layouts[3]).toEqual({ lane: 1, edges: [{ fromLane: 0, toLane: 0 }, { fromLane: 1, toLane: 0 }] });
    expect(layouts[4]).toEqual({ lane: 0, edges: [] });
  });

  test('多头起始（两分支尖）：第二头开 1 号泳道并在根部汇入第一头', () => {
    const layouts = buildGraphLayouts([commit('h1', ['r']), commit('h2', ['r']), commit('r', [])]);
    expect(layouts[0]).toEqual({ lane: 0, edges: [{ fromLane: 0, toLane: 0 }] });
    expect(layouts[1]).toEqual({ lane: 1, edges: [{ fromLane: 0, toLane: 0 }, { fromLane: 1, toLane: 0 }] });
    expect(layouts[2]).toEqual({ lane: 0, edges: [] });
  });

  test('八爪 merge（三父）：第一父直落，其余父依次开新泳道', () => {
    const layouts = buildGraphLayouts([commit('octopus', ['a', 'b', 'c']), commit('a', []), commit('b', []), commit('c', [])]);
    expect(layouts[0]).toEqual({
      lane: 0,
      edges: [{ fromLane: 0, toLane: 0 }, { fromLane: 0, toLane: 1 }, { fromLane: 0, toLane: 2 }],
    });
    expect(layouts[1]?.lane).toBe(0);
    expect(layouts[2]?.lane).toBe(1);
    expect(layouts[3]?.lane).toBe(2);
  });

  test('泳道复用：支线汇入后空出的泳道被后续分叉复用（不无限开新道）', () => {
    // merge 后 1 号泳道空闲；随后与历史无关的新头 X 复用 0 号（firstFreeLane）
    const layouts = buildGraphLayouts([
      commit('merge', ['a', 'b']),
      commit('a', []),
      commit('b', []),
      commit('x', ['y']),
      commit('y', []),
    ]);
    expect(layouts[3]?.lane).toBe(0);
    expect(laneCountOf(layouts[0] ?? { lane: 0, edges: [] })).toBe(2);
  });

  test('空提交列表 → 空布局', () => {
    expect(buildGraphLayouts([])).toEqual([]);
  });
});

describe('laneCountOf', () => {
  test('取本行 lane 与全部连边两端的最大序号 +1', () => {
    expect(laneCountOf({ lane: 0, edges: [{ fromLane: 0, toLane: 2 }] })).toBe(3);
    expect(laneCountOf({ lane: 4, edges: [] })).toBe(5);
    expect(laneCountOf({ lane: 1, edges: [{ fromLane: 1, toLane: 1 }] })).toBe(2);
  });
});
