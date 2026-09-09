import { copy } from '@/strings';
import { TurnAnchor } from './turn-anchor';
import type { TurnAnchorDatum } from './turn-anchor-data';

type TurnAnchorRailProps = {
  /** 已结束轮次的锚点数据（顺序与消息流一致） */
  anchors: readonly TurnAnchorDatum[]
  /** 点击刻痕：按 turn id 把对应轮次滚入消息流视口 */
  onJump: (id: string) => void
}

/**
 * 历史轮锚点带：侧边栏右侧安全间隙（主区 px-40）里的垂直短条列——
 * 挂在主区固定高根（滚动容器外，左缘即侧栏右缘），距侧栏 16px；
 * 锚点列整体垂直居中恒定于视口，不随页面滚动；刻痕 20px 等距节距。
 */
function TurnAnchorRail({ anchors, onJump }: TurnAnchorRailProps) {
  if (anchors.length < 3) return null;
  return (
    <nav aria-label={copy.flow.turnAnchorRailAria} className="absolute inset-y-0 left-[16px] flex w-[22px] items-center">
      <div className="flex flex-col">
        {anchors.map((anchor) => (
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
