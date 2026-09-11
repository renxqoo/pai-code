import type { GitGraphCommit } from '@paiapp/contracts';

import { cn } from '@/lib/utils';

import { laneColor } from './git-graph-lane-palette';
import type { GraphRowLayout } from './graph-model';

type GitGraphLaneCellProps = {
  commit: GitGraphCommit
  layout: GraphRowLayout
  /** 本行已占泳道数，参与 SVG 宽度下限计算 */
  laneCount: number
  /** 末行没有下一行，连边终止在本行底边，避免悬垂出滚动内容 */
  isLast: boolean
  className?: string
};

/** 泳道几何常量（行高与网格图列宽需与 GitGraphRow 保持一致）。 */
const ROW_HEIGHT = 58;
const CELL_WIDTH = 85;
/** 首泳道圆心距列左缘的距离，与泳道间距同值（设计稿比例）。 */
const LANE_ORIGIN_X = 16;
const LANE_SPACING = 16;
const NODE_RADIUS = 4;
/** HEAD 节点的外圈（双圆环形态）。 */
const HEAD_RING_RADIUS = 7.5;
const EDGE_WIDTH = 2.5;
/** 连边进入/离开节点段长；其余行程是竖线与圆角 S 曲线。 */
const CURVE_MARGIN = 5;

function laneX(lane: number): number {
  return LANE_ORIGIN_X + lane * LANE_SPACING;
}

/** 连边路径：同泳道竖线；跨泳道为两段竖线夹一条端点切线竖直的圆角 S 曲线。 */
function edgePath(fromX: number, toX: number, top: number, bottom: number): string {
  if (fromX === toX) return `M ${fromX} ${top} L ${toX} ${bottom}`;
  const midY = (top + bottom) / 2;
  return [
    `M ${fromX} ${top}`,
    `L ${fromX} ${midY - CURVE_MARGIN}`,
    `C ${fromX} ${midY} ${toX} ${midY}`,
    `${toX} ${midY + CURVE_MARGIN}`,
    `L ${toX} ${bottom}`,
  ].join(' ');
}

/** 单行泳道 SVG：本行节点 + 伸向下一行的连边；下游半程由下一行的同源连边续接。 */
function GitGraphLaneCell({ commit, layout, laneCount, isLast, className }: GitGraphLaneCellProps) {
  const nodeY = ROW_HEIGHT / 2;
  const height = isLast ? ROW_HEIGHT : ROW_HEIGHT * 1.5;
  const maxLane = Math.max(
    layout.lane,
    laneCount - 1,
    ...layout.edges.map((edge) => Math.max(edge.fromLane, edge.toLane)),
  );
  const width = Math.max(CELL_WIDTH, LANE_ORIGIN_X + maxLane * LANE_SPACING + LANE_ORIGIN_X);
  const nodeColor = laneColor(layout.lane);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className={cn('pointer-events-none block', className)}
    >
      {layout.edges.map((edge, index) => {
        const color = laneColor(edge.toLane);
        return (
          <path
            key={`${edge.fromLane}-${edge.toLane}-${index}`}
            d={edgePath(laneX(edge.fromLane), laneX(edge.toLane), nodeY, height)}
            fill="none"
            strokeWidth={EDGE_WIDTH}
            className={color.stroke}
          />
        );
      })}
      {commit.isHead && (
        <circle
          cx={laneX(layout.lane)}
          cy={nodeY}
          r={HEAD_RING_RADIUS}
          fill="none"
          strokeWidth={1.5}
          className={nodeColor.stroke}
        />
      )}
      {/* 节点描边取面板底色，隔开连边与节点形成留白圈 */}
      <circle
        cx={laneX(layout.lane)}
        cy={nodeY}
        r={NODE_RADIUS}
        strokeWidth={2}
        className={cn(nodeColor.fill, 'stroke-surface-subtle')}
      />
    </svg>
  );
}

export { GitGraphLaneCell };
export type { GitGraphLaneCellProps };
