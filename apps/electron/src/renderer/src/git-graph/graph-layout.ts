import type { GitGraphCommit } from '@paiapp/contracts';

import type { GraphLaneEdge, GraphRowLayout } from './graph-model';

/**
 * 泳道布局：按 git log 顺序（新 → 旧）为每行指派泳道并生成本行伸向下一行的连边。
 * 规则：上游悬空等待本行 hash 的泳道即本行泳道；第一父优先继承本行泳道（主线直落），
 * 其余父汇入已悬空等待的泳道或开新泳道（支线甩出）；其余被占泳道画贯穿竖线。
 */
export function buildGraphLayouts(commits: readonly GitGraphCommit[]): GraphRowLayout[] {
  const layouts: GraphRowLayout[] = [];
  /** 每条泳道悬空等待的父提交 hash；null = 空泳道 */
  const laneHeads: (string | null)[] = [];

  const firstFreeLane = (): number => {
    const free = laneHeads.indexOf(null);
    if (free !== -1) return free;
    laneHeads.push(null);
    return laneHeads.length - 1;
  };

  for (const commit of commits) {
    let lane = laneHeads.indexOf(commit.hash);
    if (lane === -1) lane = firstFreeLane();
    laneHeads[lane] = null;

    const edges: GraphLaneEdge[] = [];
    for (let i = 0; i < laneHeads.length; i++) {
      if (laneHeads[i] !== null) edges.push({ fromLane: i, toLane: i });
    }

    const branchLane = (): number => {
      const free = laneHeads.findIndex((head, index) => head === null && index !== lane);
      if (free !== -1) return free;
      laneHeads.push(null);
      return laneHeads.length - 1;
    };

    const usedTargets = new Set<number>();
    commit.parents.forEach((parent, parentIndex) => {
      let target = laneHeads.indexOf(parent);
      if (target !== -1 && usedTargets.has(target)) target = -1;
      if (target === -1) target = parentIndex === 0 ? lane : branchLane();
      usedTargets.add(target);
      edges.push({ fromLane: lane, toLane: target });
      laneHeads[target] = parent;
    });

    layouts.push({ lane, edges });
  }
  return layouts;
}

/** 单行已占泳道数（供泳道 SVG 计算宽度下限）。 */
export function laneCountOf(layout: GraphRowLayout): number {
  let count = layout.lane + 1;
  for (const edge of layout.edges) {
    count = Math.max(count, edge.fromLane + 1, edge.toLane + 1);
  }
  return count;
}
