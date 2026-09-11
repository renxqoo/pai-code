import * as React from 'react';

/**
 * 观测元素渲染高度并回调（挂载即测一次 + ResizeObserver 持续跟随）。
 * 用于把输入浮层的实际高度发布成消息流的底部避让依据。
 *
 * 返回回调 ref：元素替换（条件挂载往返，如新建任务页进出）即对新元素重挂
 * 观测并返回清理函数。固定 deps 的 layout effect 形态会攥住旧元素引用——
 * overlay 卸载重挂后观测静默死亡，高度冻结在初始值（避让失真的根因）。
 */
export function useObservedHeight<T extends HTMLElement>(
  onHeight: (height: number) => void,
): (element: T | null) => void | (() => void) {
  const onHeightRef = React.useRef(onHeight);
  onHeightRef.current = onHeight;

  return React.useCallback((element: T | null) => {
    if (element === null) return undefined;
    const report = (): void => {
      onHeightRef.current(element.getBoundingClientRect().height);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
}
