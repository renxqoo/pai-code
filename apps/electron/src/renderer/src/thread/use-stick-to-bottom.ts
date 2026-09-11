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
 * 滚动贴底跟随：挂在滚动容器上，内容增长时贴住底缘，用户上翻即让位，
 * 回到底部附近自动恢复跟随。只渲染时机做一次定位，不挂计时器。
 * 内容尺寸变化经 ResizeObserver 观测内容列（滚动容器盒由视口决定、不随内容
 * 变化——只观察容器对流式追加/折叠展开/图片加载零感知）。
 * 程序触发的平滑滚动（回底浮标）途中：中间位置不等价于用户上翻，不让位；
 * 用户上翻（滚轮/拖拽）显式中断跟随意图。enabled 关闭时全部闲置（不吸附不
 * 跟随），重新开启后自当前位置恢复判断。
 */
export function useStickToBottom(options: StickToBottomOptions = {}): StickToBottom {
  const { enabled = true } = options;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stuckRef = React.useRef(true);
  const arrivingRef = React.useRef(false);
  const [atBottom, setAtBottom] = React.useState(true);

  const syncFromScroll = React.useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    if (arrivingRef.current) {
      // 程序滚动的中间帧不是用户让位：到达底部附近才结束到达态
      if (isNearBottom(container)) arrivingRef.current = false;
      stuckRef.current = true;
      setAtBottom(true);
      return;
    }
    stuckRef.current = isNearBottom(container);
    setAtBottom(stuckRef.current);
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || !enabled) return;
    const observer = new ResizeObserver(() => {
      if (stuckRef.current) {
        container.scrollTop = container.scrollHeight;
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
    // 用户显式上翻中断程序到达态与跟随（下行滚动不视为让位）
    const onUserScrollUp = (event: WheelEvent): void => {
      if (event.deltaY < 0) {
        arrivingRef.current = false;
        stuckRef.current = false;
      }
    };
    const onUserDrag = (): void => {
      arrivingRef.current = false;
    };
    container.addEventListener('wheel', onUserScrollUp);
    container.addEventListener('pointerdown', onUserDrag);
    return () => {
      container.removeEventListener('wheel', onUserScrollUp);
      container.removeEventListener('pointerdown', onUserDrag);
    };
  }, [enabled]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || !enabled || !stuckRef.current) return;
    container.scrollTop = container.scrollHeight;
  });

  const scrollToBottom = React.useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    stuckRef.current = true;
    // 尊重系统减弱动态偏好：平滑滚动降级为直接定位（与轮次锚点跳转同约定）
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      container.scrollTop = container.scrollHeight;
      arrivingRef.current = false;
    } else {
      arrivingRef.current = true;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    setAtBottom(true);
  }, []);

  return { containerRef, onScroll: syncFromScroll, atBottom, scrollToBottom };
}
