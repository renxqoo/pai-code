import * as React from 'react';

type HoverIntentOptions = {
  /** 进入后延迟打开（毫秒）：鼠标扫过触发区不闪弹层。 */
  openDelayMs?: number;
  /** 离开后延迟关闭（毫秒）：跨越触发器与弹层之间的缝隙不闪断。 */
  closeDelayMs?: number;
};

type HoverIntent = {
  open: boolean;
  /** 立即开（键盘/触摸焦点进入，无延迟）。 */
  openNow: () => void;
  /** 立即关（失焦）。 */
  closeNow: () => void;
  onEnter: () => void;
  onLeave: () => void;
};

/** hover 触发意图：进延迟开、出延迟关，同帧重入即撤销上一个计时（防 UI 闪烁）；
 *  计时器随卸载清理，不留悬挂回调。延迟经 options 注入，测试用 0 免等真实时序。 */
function useHoverIntent(options: HoverIntentOptions = {}): HoverIntent {
  const openDelayMs = options.openDelayMs ?? 80;
  const closeDelayMs = options.closeDelayMs ?? 180;
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  const clear = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const schedule = (next: boolean, delayMs: number): void => {
    clear();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setOpen(next);
    }, delayMs);
  };
  React.useEffect(() => clear, []);

  return {
    open,
    openNow: () => {
      clear();
      setOpen(true);
    },
    closeNow: () => {
      clear();
      setOpen(false);
    },
    onEnter: () => schedule(true, openDelayMs),
    onLeave: () => schedule(false, closeDelayMs),
  };
}

export { useHoverIntent };
export type { HoverIntent, HoverIntentOptions };
