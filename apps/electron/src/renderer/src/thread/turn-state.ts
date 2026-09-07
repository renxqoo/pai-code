import type { TurnModel } from './thread-model';

/** 轮次是否仍在走表（细节实时展开、状态行实时计时）。 */
export function isTurnRunning(turn: Pick<TurnModel, 'status'>): boolean {
  return turn.status === 'running';
}

/**
 * 计时基准：运行中取观察时刻，结束/停止冻结在 endedAt。
 * 非有限时间与倒挂区间（endedAt < startedAt、时钟回拨）一律降级为 0。
 */
export function turnElapsedMs(
  turn: Pick<TurnModel, 'status' | 'startedAt' | 'endedAt'>,
  now: number,
): number {
  const endAt = turn.status === 'running' ? now : turn.endedAt;
  if (endAt === null || !Number.isFinite(endAt) || !Number.isFinite(turn.startedAt)) return 0;
  return Math.max(0, endAt - turn.startedAt);
}
