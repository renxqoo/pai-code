import * as React from 'react';

/**
 * 观测元素渲染高度并回调（初始一次 + ResizeObserver 持续跟随）。
 * 用于把输入浮层的实际高度发布成消息流的底部避让依据。
 */
export function useObservedHeight<T extends HTMLElement>(
  onHeight: (height: number) => void,
): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const report = () => {
      onHeight(element.getBoundingClientRect().height);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeight]);

  return ref;
}
