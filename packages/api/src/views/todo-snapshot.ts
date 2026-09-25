import { TodoSnapshotEventDataSchema, type TodoSnapshotEventData } from '@paiapp/contracts';

/**
 * todo/snapshot 载荷 → 快照视图（实时帧与 WAL 事件同一展平形状，外层壳字段
 * 由 schema 剥离）；垃圾形状返回 null（降级跳过，不崩不造）。
 */
export function todoSnapshotOf(payload: Record<string, unknown>): TodoSnapshotEventData | null {
  const parsed = TodoSnapshotEventDataSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
