import * as React from 'react';

/**
 * 观测元素渲染宽度并回调（初始一次 + ResizeObserver 持续跟随）。
 * 用于把标题覆盖块的实际宽度发布成布局避让依据。
 */
export function useObservedWidth<T extends HTMLElement>(
  onWidth: (width: number) => void,
): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const report = () => {
      onWidth(element.getBoundingClientRect().width);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onWidth]);

  return ref;
}
