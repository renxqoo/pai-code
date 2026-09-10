type TickerTrackProps = {
  text: string
  /** 一轮滑动的时长（秒）：随文本长度定速，保持恒定滑动速度 */
  durationSeconds: number
};

const MIN_DURATION_SECONDS = 6;
const MAX_DURATION_SECONDS = 30;
/** 定速基准：每字符滑过秒数的倒数，短文本放缓、长文本加速，均被钳在上下限内 */
const CHARS_PER_SECOND = 18;

/** 按文本长度折算一轮滑动时长（秒），钳在 [6, 30] 区间。 */
function tickerDurationSeconds(text: string): number {
  const raw = text.length / CHARS_PER_SECOND;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, raw));
}

/**
 * 跑马灯滑动轨：同一文本双份等宽排列，轨道位移 -50% 即滑过一份，
 * 首尾相接形成无缝循环；本体只承担视觉，对读屏隐藏（替身文本由调用方提供）。
 */
function TickerTrack({ text, durationSeconds }: TickerTrackProps) {
  return (
    <span aria-hidden="true" className="ticker-track flex w-max" style={{ animationDuration: `${durationSeconds}s` }}>
      <span className="whitespace-pre pr-[40px]">{text}</span>
      <span className="whitespace-pre pr-[40px]">{text}</span>
    </span>
  );
}

export { TickerTrack, tickerDurationSeconds };
export type { TickerTrackProps };
