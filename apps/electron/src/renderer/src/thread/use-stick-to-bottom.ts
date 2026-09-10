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
 * 内容尺寸变化（流式追加/面板开合改宽度）经 ResizeObserver 重估位置，
 * 不产生 scroll 事件的位移也能维持正确的 atBottom。
 * enabled 关闭时全部闲置（不吸附不跟随），重新开启后自当前位置恢复判断。
 */
export function useStickToBottom(options: StickToBottomOptions = {}): StickToBottom {
  const { enabled = true } = options;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stuckRef = React.useRef(true);
  const [atBottom, setAtBottom] = React.useState(true);

  const syncFromScroll = React.useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
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
    return () => observer.disconnect();
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
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    setAtBottom(true);
  }, []);

  return { containerRef, onScroll: syncFromScroll, atBottom, scrollToBottom };
}
