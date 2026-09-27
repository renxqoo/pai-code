import * as React from 'react';

import { TURN_SCROLL_MARGIN_PX } from './turn-scroll-margin';

/** 判读容差：跳转落点受缩放/分数布局影响是 scroll-mt ±零点几 px，严格比较恒偏一轮。 */
const JUDGE_EPS_PX = 0.5;

/** 贴底容差：尾部短轮链顶边压不满判读线时（scrollTop 被 maxScroll 钳制）靠贴底识别。 */
const AT_BOTTOM_EPS_PX = 2;

/**
 * 当前轮判定（纯函数）：各锚点所在轮次 section 顶边（视口坐标）在判读线内（含压线 +
 * JUDGE_EPS_PX 容差）的最后一个下标即当前阅读轮；无线命中降级 0。非有限几何
 * （缺失/脱离文档 section 的 +∞ 哨兵）跳过不参与判定；空输入返回 0。
 */
export function anchorIndexAtTops(tops: readonly number[], judgeLine: number): number {
  let current = 0;
  for (let i = 0; i < tops.length; i += 1) {
    const top = tops[i];
    if (top === undefined || !Number.isFinite(top)) continue;
    if (top <= judgeLine + JUDGE_EPS_PX) current = i;
  }
  return current;
}

/** 锚点 id 序列身份：流式期 items 逐事件换引用，内容不变不得换身份（否则测量面逐事件重建）。 */
type AnchorIds = { key: string; ids: readonly string[] };

/**
 * 当前阅读轮锚点下标（T55 窗口中心）：挂在消息流滚动容器上，滚动 + 挂载 + 锚点集
 * 变化 + 内容几何变化（ResizeObserver：折叠开合/图片加载）时按轮次 section 几何判定
 * ——最后越过判读线的锚点；贴底（含尾部短轮链压不满线）恒认末锚点。section 节点
 * 缓存在 ref（滚动只读几何，不走全树查询），锚点集内容变化才重建。下标不变不
 * setState（流式期滚动不重渲舞台）；useLayoutEffect 落判定（换会话 pre-paint 校正，
 * 不带旧下标上屏）；监听/观测随卸载拆除。
 */
export function useCurrentAnchorIndex(
  containerRef: React.RefObject<HTMLElement | null>,
  anchorIds: readonly string[],
): number {
  const [index, setIndex] = React.useState(0);
  const indexRef = React.useRef(0);
  const idsKey = anchorIds.join('\u0000');
  const idsRef = React.useRef<AnchorIds | null>(null);
  if (idsRef.current === null || idsRef.current.key !== idsKey) {
    idsRef.current = { key: idsKey, ids: anchorIds };
  }
  const stableIds = idsRef.current.ids;
  const sectionsRef = React.useRef<Map<string, Element>>(new Map());

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null || stableIds.length === 0) {
      // 空锚点集显式归零：换会话空档不得把旧下标带给下个非空集首帧
      if (indexRef.current !== 0) {
        indexRef.current = 0;
        setIndex(0);
      }
      return;
    }
    const rebuildSections = (): void => {
      const sections = new Map<string, Element>();
      for (const node of container.querySelectorAll('[data-turn-id]')) {
        sections.set(node.getAttribute('data-turn-id') ?? '', node);
      }
      sectionsRef.current = sections;
    };
    const measure = (): void => {
      // 缓存节点被重挂（水化替换/列表重建）时整体重建：脱高节点按 +∞ 会误判
      for (const section of sectionsRef.current.values()) {
        if (!section.isConnected) {
          rebuildSections();
          break;
        }
      }
      const judgeLine = container.getBoundingClientRect().top + TURN_SCROLL_MARGIN_PX;
      const tops: number[] = [];
      for (const id of stableIds) {
        const section = sectionsRef.current.get(id);
        // 脱离文档的缓存节点按缺失处理（零几何会误判压线命中）
        const top = section === undefined || !section.isConnected ? Number.POSITIVE_INFINITY : section.getBoundingClientRect().top;
        tops.push(top);
        // 顶边沿消息流单调递增：首个有限顶边越线后不必再读（每滚动只读不写，无强制回流）
        if (Number.isFinite(top) && top > judgeLine + JUDGE_EPS_PX) break;
      }
      let next = anchorIndexAtTops(tops, judgeLine);
      const { scrollTop, scrollHeight, clientHeight } = container;
      // 尾部短轮链 / 跳转落点被 maxScroll 钳制时判读线压不满：贴底即认末锚点
      if (clientHeight > 0 && scrollHeight > 0 && scrollHeight - scrollTop - clientHeight <= AT_BOTTOM_EPS_PX) {
        next = stableIds.length - 1;
      }
      // 同值不 setState：updater 形态同值也会调度渲染，流式期滚动会击穿舞台重渲半径
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
    };
    rebuildSections();
    measure();
    container.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const content = container.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);
    return () => {
      container.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [containerRef, stableIds]);

  return index;
}
