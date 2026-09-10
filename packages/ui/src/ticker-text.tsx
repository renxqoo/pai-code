import * as React from 'react';

import { cn } from 'cn';

import { TickerTrack, tickerDurationSeconds } from './ticker-track';

type TickerTextProps = {
  /** 单行文本（调用方负责压平空白与截断上限） */
  text: string
  /** 流式激活：文本溢出行宽时滑动展示；静止或未溢出退化为普通单行截断 */
  active: boolean
  className?: string
};

/**
 * 流式单行跑马灯：收起态预览一行放不下且内容仍在输出时，文本沿水平方向匀速滑动
 * （ZCode 式动态），随内容增长重新测量；对读屏以静态全量文本播报。
 * 减弱动态偏好下滑动停帧（styles.css media query），退化为溢出裁切。
 */
function TickerText({ text, active, className }: TickerTextProps) {
  const [overflowing, setOverflowing] = React.useState(false);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!active) {
      setOverflowing(false);
      return;
    }
    const el = measureRef.current;
    if (el === null) return;
    const update = (): void => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, text]);

  if (!active || !overflowing) {
    return (
      <span ref={measureRef} className={cn('block truncate', className)}>
        {text}
      </span>
    );
  }
  return (
    <span className={cn('block overflow-hidden', className)}>
      <TickerTrack text={text} durationSeconds={tickerDurationSeconds(text)} />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export { TickerText };
export type { TickerTextProps };
