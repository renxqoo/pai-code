/** 一条连边：从当前行 fromLane 泳道连向下一行 toLane 泳道。 */
export type GraphLaneEdge = { fromLane: number; toLane: number };
/** 单行泳道布局：lane = 本行节点所在泳道序号；edges = 本行节点伸向下一行的连边。 */
export type GraphRowLayout = { lane: number; edges: readonly GraphLaneEdge[] };
