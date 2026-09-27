import * as React from 'react';

import { copy } from '@/strings';
import { TurnAnchor } from './turn-anchor';
import { turnAnchorWindow } from './turn-anchor-window';
import type { TurnAnchorDatum } from './turn-anchor-data';

type TurnAnchorRailProps = {
  /** 已结束轮次的锚点数据（顺序与消息流一致，全量） */
  anchors: readonly TurnAnchorDatum[]
  /** 当前阅读轮锚点下标（0 基，窗口中心；越界/垃圾值由窗口函数钳制降级） */
  currentIndex: number
  /** 点击刻痕：按 turn id 把对应轮次滚入消息流视口 */
  onJump: (id: string) => void
}

/**
 * 历史轮锚点带：侧边栏右侧安全间隙（主区 px-40）里的垂直短条列——
 * 挂在主区固定高根（滚动容器外，左缘即侧栏右缘），距侧栏 16px；
 * 锚点列整体垂直居中恒定于视口，不随页面滚动；刻痕 20px 等距节距。
 * 刻痕窗口化（T55）：同屏最多 2R+1 = 21 个刻痕，以当前阅读轮为中心随滚动滑动，
 * 两端钳制；总锚点 ≤21 全量展示。是否启锚点带仍看全量锚点数（短会话不启）。
 * 焦点连续性：焦点刻痕滑出窗口被卸载时焦点不得落 body（键盘断位）——迁到窗口内
 * 锚点下标最接近的刻痕；离开 nav 的 blur 才清焦点登记（卸载不派发 blur，留守者
 * 即待迁者）。
 */
function TurnAnchorRail({ anchors, currentIndex, onJump }: TurnAnchorRailProps) {
  const navRef = React.useRef<HTMLElement | null>(null);
  const focusedIdRef = React.useRef<string | null>(null);
  const visible = turnAnchorWindow(anchors, currentIndex);

  React.useEffect(() => {
    const nav = navRef.current;
    const focusedId = focusedIdRef.current;
    if (nav === null || focusedId === null) return;
    if (visible.some((anchor) => anchor.id === focusedId)) return;
    // 焦点刻痕已随窗口滑出被卸载：迁到窗口内锚点下标最接近的刻痕
    const focusedIndex = anchors.findIndex((anchor) => anchor.id === focusedId);
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    visible.forEach((anchor, position) => {
      const distance = Math.abs(anchors.findIndex((item) => item.id === anchor.id) - focusedIndex);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = position;
      }
    });
    const buttons = nav.querySelectorAll('button');
    const target = buttons[nearest];
    if (target instanceof HTMLElement) {
      target.focus();
      focusedIdRef.current = visible[nearest]?.id ?? null;
    }
    // 依赖锚点集与窗口中心：二者变化即判定焦点刻痕是否已被滑出（visible 由二者派生）
  }, [anchors, currentIndex]);

  const handleFocus = (event: React.FocusEvent): void => {
    const nav = navRef.current;
    if (nav === null) return;
    const buttons = nav.querySelectorAll('button');
    const position = Array.prototype.indexOf.call(buttons, event.target);
    focusedIdRef.current = visible[position]?.id ?? null;
  };

  const handleBlur = (event: React.FocusEvent): void => {
    const nav = navRef.current;
    if (nav === null) return;
    // 焦点只在 nav 内部移动（刻痕间 Tab）不注销；离开 nav 才注销（之后不再迁焦）
    if (event.relatedTarget instanceof Node && nav.contains(event.relatedTarget)) return;
    focusedIdRef.current = null;
  };

  if (anchors.length < 3) return null;
  return (
    <nav
      ref={navRef}
      aria-label={copy.flow.turnAnchorRailAria}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="absolute inset-y-0 left-[16px] flex w-[22px] items-center"
    >
      <div className="flex flex-col">
        {visible.map((anchor) => (
          <TurnAnchor
            key={anchor.id}
            time={anchor.time}
            summary={anchor.summary}
            onJump={() => onJump(anchor.id)}
          />
        ))}
      </div>
    </nav>
  );
}

export { TurnAnchorRail };
