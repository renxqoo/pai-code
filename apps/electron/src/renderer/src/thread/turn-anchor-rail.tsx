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
 * 历史轮锚点带：主区左缘栏沟（侧边栏右侧的安全间隙）里的垂直短条列——
 * 水平固定贴主区左缘（不随会话列居中漂移），垂直吸附在滚动视口竖直居中处，
 * 刻痕 20px 等距节距。挂在消息流滚动容器上。
 */
function TurnAnchorRail({ anchors, onJump }: TurnAnchorRailProps) {
  if (anchors.length === 0) return null;
  return (
    <nav aria-label={copy.flow.turnAnchorRailAria} className="absolute inset-y-0 left-[9px] w-[22px]">
      <div className="sticky top-1/2 flex -translate-y-1/2 flex-col">
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
