import * as React from 'react';

export type StickToBottomOptions = {
  /** 贴底跟随开关：关闭时不吸附、不跟随内容增长（嵌套限高区域按需启停） */
  enabled?: boolean
};

export type StickToBottom = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  /** 当前是否位于底部附近，驱动「回到底部」浮标显隐 */
  atBottom: boolean;
  scrollToBottom: () => void;
};

const NEAR_BOTTOM_PX = 48;

function isNearBottom(container: HTMLElement): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX;
}

/**
 * 滚动贴底跟随：挂在滚动容器上，内容增长时贴住底缘；用户上翻即让位，只有
 * 用户下滚回到底部附近（或程序回底/发送回底）才恢复跟随。
 * 让位判读走滚动增量方向而非位置死区：上行增量（滚轮/拖拽/键盘同路径）立即
 * 让位——48px 内的小步上翻不再被「近底」重武装后拽回；位置死区只用于判
 * 「回到底部附近」的恢复时机与浮标显隐。滚轮上翻在 scroll 事件落帧前先一步
 * 表达让位意图，消除与内容增长钉底同帧的竞态。
 * 钉底只在内容增长时执行（ResizeObserver 观测内容列；滚动容器盒由视口决定、
 * 不随内容变化——只观察容器对流式追加/折叠展开/图片加载零感知），渲染时机
 * 不钉底：拽回不会来自重渲。程序写入 scrollTop 后同步登记增量基准，自身
 * 写入不计为用户滚动。程序触发的平滑滚动（回底）途中：中间帧不等价于
 * 用户上翻，到达态显隐保持到底；用户上行滚动立即中断程序到达。
 * enabled 关闭时全部闲置（不吸附不跟随），重新开启后自当前位置恢复判断。
 */
export function useStickToBottom(options: StickToBottomOptions = {}): StickToBottom {
  const { enabled = true } = options;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const followingRef = React.useRef(true);
  const arrivingRef = React.useRef(false);
  const lastScrollTopRef = React.useRef<number | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);

  const syncFromScroll = React.useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    const top = container.scrollTop;
    const previous = lastScrollTopRef.current;
    lastScrollTopRef.current = top;
    const near = isNearBottom(container);
    if (previous !== null && top < previous) {
      // 上行滚动（滚轮/拖拽/键盘同路径）：用户让位，程序到达态一并中断
      arrivingRef.current = false;
      followingRef.current = false;
    } else if (previous !== null && top > previous && near) {
      // 下行（含程序钉底）回到近底：恢复跟随、收掉到达态
      arrivingRef.current = false;
      followingRef.current = true;
    }
    setAtBottom(arrivingRef.current || near);
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || !enabled) return;
    lastScrollTopRef.current = container.scrollTop;
    const observer = new ResizeObserver(() => {
      if (followingRef.current || arrivingRef.current) {
        // 内容增长贴底；程序到达途中被增长甩开时硬钉到当前底（钉底即到达）
        arrivingRef.current = false;
        container.scrollTop = container.scrollHeight;
        lastScrollTopRef.current = container.scrollTop;
        setAtBottom(true);
        return;
      }
      setAtBottom(isNearBottom(container));
    });
    observer.observe(container);
    // 内容列（首子元素）才是内容增长的观测面；列元素跨空态/列表持续存在
    const content = container.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);
    return () => observer.disconnect();
  }, [enabled]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || !enabled) return;
    // 滚轮上翻在 scroll 事件落帧前就让位：增长钉底同帧竞态里先一步表达意图
    const onWheelUp = (event: WheelEvent): void => {
      if (event.deltaY < 0) {
        arrivingRef.current = false;
        followingRef.current = false;
      }
    };
    container.addEventListener('wheel', onWheelUp);
    return () => container.removeEventListener('wheel', onWheelUp);
  }, [enabled]);

  const scrollToBottom = React.useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    followingRef.current = true;
    // 尊重系统减弱动态偏好：平滑滚动降级为直接定位（与轮次锚点跳转同约定）
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      arrivingRef.current = false;
    } else {
      arrivingRef.current = true;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    setAtBottom(true);
  }, []);

  return { containerRef, onScroll: syncFromScroll, atBottom, scrollToBottom };
}
