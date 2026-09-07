export interface ReplayOptions {
  /** 逐条间隔毫秒（默认 10）。 */
  intervalMs?: number;
  /** 速率倍数（默认 1；>1 更快，实际间隔 = intervalMs / speed）。 */
  speed?: number;
}

/**
 * 回放器：把预置序列按节拍逐条投递。step() 同步推进一步（测试主用），
 * run() 按间隔异步跑完或被 stop() 中断。
 */
export class ReplayHarness<T> {
  private idx = 0;
  private stopped = false;
  private runPromise: Promise<void> | null = null;
  private readonly intervalMs: number;
  private readonly speed: number;
  private readonly deliver: (item: T) => void;
  private readonly items: readonly T[];

  constructor(
    deliver: (item: T) => void,
    items: readonly T[],
    opts: ReplayOptions = {},
  ) {
    this.deliver = deliver;
    this.items = items;
    this.intervalMs = opts.intervalMs ?? 10;
    this.speed = opts.speed ?? 1;
    if (!Number.isFinite(this.intervalMs) || this.intervalMs < 0) throw new Error('interval_ms_invalid');
    if (!Number.isFinite(this.speed) || this.speed <= 0) throw new Error('speed_invalid');
  }

  /** 投递下一条；耗尽或已停止返回 null。 */
  step(): T | null {
    if (this.stopped || this.idx >= this.items.length) return null
    const item = this.items[this.idx]
    if (item === undefined) return null
    this.idx += 1
    this.deliver(item)
    return item
  }

  plannedInterval(): number {
    return this.intervalMs / this.speed;
  }

  remaining(): number {
    return this.items.length - this.idx;
  }

  stop(): void {
    this.stopped = true;
  }

  /** 并发调用复用同一次执行（节奏不翻倍）。 */
  run(): Promise<void> {
    if (this.runPromise) return this.runPromise;
    this.runPromise = this.runLoop().finally(() => {
      this.runPromise = null;
    });
    return this.runPromise;
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped && this.idx < this.items.length) {
      await new Promise((r) => {
        setTimeout(r, this.intervalMs / this.speed)
      });
      if (this.stopped) return;
      this.step();
    }
  }
}
