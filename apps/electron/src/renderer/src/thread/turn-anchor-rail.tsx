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
 * 历史轮锚点带：消息内容列左外栏沟里的垂直短条列（左对齐、20px 等距节距），
 * 随滚动吸附在视口竖直居中处，所有已结束轮次的刻痕紧凑顺序排列。
 * 挂在会话列容器（CONVERSATION_COLUMN_CLASS）上，宽出列缘 32px；
 * 窄视口（<1280px）无栏沟，整带隐藏而不是留下半个被裁切的标记。
 */
function TurnAnchorRail({ anchors, onJump }: TurnAnchorRailProps) {
  if (anchors.length === 0) return null;
  return (
    <nav aria-label={copy.flow.turnAnchorRailAria} className="absolute inset-y-0 right-full mr-[10px] hidden w-[22px] min-[1280px]:block">
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
