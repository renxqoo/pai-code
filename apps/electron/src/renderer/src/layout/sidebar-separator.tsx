import { cn } from '@/lib/utils';

type SidebarSeparatorProps = {
  width: number
  minWidth: number
  maxWidth: number
  dragging: boolean
  label: string
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  onResizeMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onResizeEnd: (event: React.PointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

/** 侧栏分隔条：双横杠拖拽手柄，支持指针拖动与左右方向键微调。 */
function SidebarSeparator({
  width,
  minWidth,
  maxWidth,
  dragging,
  label,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onKeyDown,
}: SidebarSeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      onPointerDown={onResizeStart}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      onPointerCancel={onResizeEnd}
      onKeyDown={onKeyDown}
      className="group absolute top-0 left-0 z-20 flex h-full w-[26px] cursor-col-resize items-center justify-start pl-[9px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex flex-col gap-[3px] rounded-full py-1 transition-colors duration-150',
          'text-foreground/75 group-hover:text-foreground',
          dragging && 'text-foreground',
        )}
      >
        <span className="block h-[3px] w-[13px] rounded-full bg-current" />
        <span className="block h-[3px] w-[13px] rounded-full bg-current" />
      </span>
    </div>
  );
}

export { SidebarSeparator };
