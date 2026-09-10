/**
 * 资源采样环（监控页 30 分钟历史的存储原语）：定长 FIFO，超限丢弃最旧。
 * 纯数据结构——采样节律（setInterval）由消费方（runtime-monitor）持有。
 */

export interface SampleRing<T> {
  push(sample: T): void;
  /** 时间升序快照（新在尾）。 */
  samples(): readonly T[];
  latest(): T | null;
}

export function createSampleRing<T>(limit: number): SampleRing<T> {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('sample_ring_limit_invalid');
  const ring: T[] = [];
  return {
    push(sample: T): void {
      ring.push(sample);
      if (ring.length > limit) ring.shift();
    },
    samples(): readonly T[] {
      return [...ring];
    },
    latest(): T | null {
      return ring.length > 0 ? (ring[ring.length - 1] as T) : null;
    },
  };
}
