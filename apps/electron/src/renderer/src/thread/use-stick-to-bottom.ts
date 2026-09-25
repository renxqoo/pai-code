import * as React from 'react';

export type StickToBottomOptions = {
  /** 贴底跟随开关：关闭时不吸附、不跟随内容增长（嵌套限高区域按需启停）。
   *  关闭期间跟随意图保留（含用户让位结果），重新开启后自当时位置恢复判断。 */
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

/** 事件起源于容器内的嵌套滚动区（如展开的思考块正文）时，滚轮手势属于该子区，
 *  不得让外层跟随让位。逐级上溯找「真能滚」的中间元素（overflow 可滚且有溢出量）。 */
function insideNestedScroller(container: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  for (let node = target.parentElement; node !== null && node !== container; node = node.parentElement) {
    if (node.scrollHeight - node.clientHeight <= 1) continue;
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return true;
  }
  return false;
}

/**
 * 滚动贴底跟随：挂在滚动容器上，内容增长时贴住底缘；用户上翻即让位，只有
 * 用户下滚回到底部附近（或程序回底/发送回底）才恢复跟随。
 * 让位判读走滚动增量方向而非位置死区：上行增量（滚轮/拖拽/键盘同路径）立即
 * 让位——48px 内的小步上翻不再被「近底」重武装后拽回；位置死区只用于判
 * 「回到底部附近」的恢复时机与浮标显隐。非用户来源的向下补偿（scroll anchoring
 * 对上方内容增缩的校正、focus 揭示滚动）落进近底死区时会被判为「回到底部」，
 * 属接受的权衡。
 * 让位意图的表达时点分两类：滚轮在 scroll 事件落帧前先一步（wheel 先于默认
 * 滚动动作）；拖拽/键盘/程序上滚（锚点跳转）没有提前信号，其位移在滚动事件
 * 派发前已生效，而观测回调先于滚动事件派发——观测回调内检测到「位置已上移
 * 且未贴底缘」即提前让位，不让随后到达的滚动事件被钉底吞掉。
 * 内容增长的观测面取并集：ResizeObserver 观测容器盒 + 内容列（图片加载/字体/
 * 折叠展开的盒变化），MutationObserver 观测容器子树（多段落流式追加/文本替换
 * 对限高容器盒与首段都可能零感知，如思考块正文）。钉底只在内容增长回调里执行，
 * 渲染时机不钉底：拽回不会来自重渲。程序写入 scrollTop 后同步登记增量基准，
 * 自身写入不计为用户滚动。程序触发的平滑滚动（回底）途中：中间帧不等价于
 * 用户上翻，到达态显隐保持到底；用户上行滚动立即中断程序到达。
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

  /** 内容变化（盒变化/子树变更）统一处置：先按已发生的上移提前让位，再贴底。 */
  const syncFromContentChange = React.useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    const top = container.scrollTop;
    const max = container.scrollHeight - container.clientHeight;
    const previous = lastScrollTopRef.current;
    if (previous !== null && top < previous && top < max) {
      // 位置已上移而滚动事件还没派发（拖拽/键盘/程序上滚的同帧竞态）：
      // 按已生效的位移提前让位，钉底不得覆盖这次上移（贴底回缩不算上移）
      arrivingRef.current = false;
      followingRef.current = false;
    }
    lastScrollTopRef.current = container.scrollTop;
    if (followingRef.current || arrivingRef.current) {
      // 内容增长贴底；程序到达途中被增长甩开时硬钉到当前底（钉底即到达）
      arrivingRef.current = false;
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      setAtBottom(true);
      return;
    }
    setAtBottom(isNearBottom(container));
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || !enabled) return;
    lastScrollTopRef.current = container.scrollTop;
    const observer = new ResizeObserver(syncFromContentChange);
    observer.observe(container);
    // 内容列（首子元素）是盒增长的观测面；列元素跨空态/列表持续存在
    const content = container.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);
    // 子树变更兜住盒观测失明的增长形态（多段落流式追加/文本替换）：
    // 限高容器的容器盒被钳制、首段写完不再变，只有变更流能看见尾部增长
    const mutations = new MutationObserver(syncFromContentChange);
    mutations.observe(container, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [enabled, syncFromContentChange]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || !enabled) return;
    // 滚轮上翻在 scroll 事件落帧前就让位：增长钉底同帧竞态里先一步表达意图
    const onWheelUp = (event: WheelEvent): void => {
      if (event.deltaY >= 0) return;
      if (insideNestedScroller(container, event.target)) return;
      arrivingRef.current = false;
      followingRef.current = false;
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
