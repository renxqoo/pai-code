import type { RuntimeEventView } from '@paiapp/contracts';

/**
 * 监督事件环（监控页时间线的存储原语）：定长 FIFO，新在尾。
 * 只存内存（监控不是舰队观测——重启清零是声明边界，不落盘）。
 */

export interface SupervisionLog {
  record(event: RuntimeEventView): void;
  /** 时间升序快照（新在尾）。 */
  list(): readonly RuntimeEventView[];
}

export function createSupervisionLog(limit: number): SupervisionLog {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('supervision_log_limit_invalid');
  const events: RuntimeEventView[] = [];
  return {
    record(event: RuntimeEventView): void {
      events.push(event);
      if (events.length > limit) events.shift();
    },
    list(): readonly RuntimeEventView[] {
      return [...events];
    },
  };
}
