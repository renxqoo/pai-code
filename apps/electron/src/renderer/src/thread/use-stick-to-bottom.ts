import * as React from 'react';

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
 * 消息流贴底跟随：内容增长时贴住底缘，用户上翻即让位，
 * 回到底部附近自动恢复跟随。只在渲染时机做一次定位，不挂计时器。
 * 内容尺寸变化（流式追加/面板开合改宽度）经 ResizeObserver 重估位置，
 * 不产生 scroll 事件的位移也能维持正确的 atBottom。
 */
export function useStickToBottom(): StickToBottom {
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
    if (container === null) return;
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
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || !stuckRef.current) return;
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
