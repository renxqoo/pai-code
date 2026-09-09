import { copy } from '@/strings';

type TurnAnchorProps = {
  /** 轮次结束时刻（已格式化的钟面时间） */
  time: string
  /** 轮次内容摘要（空串时 tooltip 只展示时刻） */
  summary: string
  /** 点击锚点：把该轮滚入消息流视口 */
  onJump: () => void
}

/**
 * 锚点带行内条目：常显轻量刻痕（14px 短条），悬停/聚焦时动画变长（22px）变实，
 * 同时浮出「时刻 + 摘要」气泡，点击把该轮滚入视口。定位（栏沟/垂直排列）由
 * TurnAnchorRail 负责，本组件只管一行刻痕自身；窄视口（<1280px）无栏沟，
 * 由 Rail 整体隐藏而不是留下半个被裁切的标记。
 */
function TurnAnchor({ time, summary, onJump }: TurnAnchorProps) {
  return (
    <button
      type="button"
      aria-label={copy.flow.turnAnchorAria(time)}
      onClick={onJump}
      className="group relative flex h-[10px] w-[22px] cursor-pointer items-center justify-start rounded-md outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className="h-[3px] w-[14px] rounded-full bg-border transition-[width,background-color] duration-150 group-hover:w-[22px] group-hover:bg-foreground group-focus-visible:w-[22px] group-focus-visible:bg-foreground motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-full z-10 ml-[10px] -translate-y-1/2 max-h-[46px] w-max max-w-[280px] overflow-hidden rounded-[8px] bg-foreground px-[10px] py-[6px] text-left text-[12px] leading-[17px] text-background opacity-0 shadow-[0_6px_16px_-6px_rgba(24,24,28,0.35)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        <span className="font-medium">{time}</span>
        {summary.length > 0 ? <span className="opacity-75"> · {summary}</span> : null}
      </span>
    </button>
  );
}

export { TurnAnchor };
